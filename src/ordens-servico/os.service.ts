import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { bloquearOrigem } from '../common/bloquear-origem';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { OrdemServico, OrdemServicoDocument } from './schemas/ordem-servico.schema';
import { ItensUtilizadosOS, ItensUtilizadosOSDocument } from './schemas/itens-utilizados-os.schema';
import { PecasReservadasOS, PecasReservadasOSDocument } from './schemas/pecas-reservadas-os.schema';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { RegistrarEntregaOsDto } from './dto/registrar-entrega-os.dto';
import { RegistrarChecklistQualidadeOsDto } from './dto/registrar-checklist-qualidade.dto';
import { RegistrarCorrecaoChecklistQualidadeDto } from './dto/registrar-correcao-checklist-qualidade.dto';
import { CreateItensUtilizadosOSDto } from './dto/create-itens-utilizados-os.dto';
import { UpdateItensUtilizadosOSDto } from './dto/update-itens-utilizados-os.dto';
import { CreatePecaReservadaOSDto } from './dto/create-peca-reservada-os.dto';
import { assertCanEditOs, assertCanTransitionOs } from './state/os.transitions';
import { OS_STATUS, isOsStatus } from './state/os.states';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { EstoqueService } from '../estoque/estoque.service';
import { MOVIMENTO_ESTOQUE_ORIGEM, MOVIMENTO_ESTOQUE_TIPO } from '../estoque/movimento-estoque.types';
import { Venda, VendaDocument } from '../financeiro/vendas/schemas/venda.schema';
import { VENDA_STATUS_FINANCEIRO, calcularStatusFinanceiroVenda } from '../financeiro/vendas/venda-financeiro.states';
import { executarTransacaoFinanceira, totalPagamentosValidosCentavos } from '../financeiro/vendas/venda-pagamentos-validos';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { assertTenantReference } from '../common/tenant-reference';
import { ORCAMENTO_STATUS } from '../orcamentos/state/orcamento.states';
import { gerarProtocoloOperacional } from '../common/protocolo-operacional';
import { buscaLiteralRegex, lerConsultaListaOperacional, respostaListaOperacional } from '../common/paginacao-operacional';
import { CHECKLIST_QUALIDADE_BASE, CHECKLIST_QUALIDADE_ROTULOS, CHECKLIST_QUALIDADE_TODOS, codigosChecklistQualidade } from './checklist-qualidade';
import { normalizarCategoriaEquipamento } from '../common/equipamento-categorias';

@Injectable()
export class OsService {
  constructor(
    @InjectModel(OrdemServico.name) private ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(ItensUtilizadosOS.name) private itensUtilizadosOSModel: Model<ItensUtilizadosOSDocument>,
    @InjectModel(PecasReservadasOS.name) private pecasReservadasOSModel: Model<PecasReservadasOSDocument>,
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly estoqueService: EstoqueService,
  ) { }

  async create(createOrdemServicoDto: CreateOrdemServicoDto, empresaId?: string, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.ordemServicoModel.db, () => this.createAtomic(createOrdemServicoDto, empresaId, user));
  }

  private async createAtomic(createOrdemServicoDto: CreateOrdemServicoDto, empresaId?: string, user?: CurrentUserPayload) {
    const scopedEmpresaId = this.getEmpresaIdPermitida(createOrdemServicoDto.empresaId, empresaId);
    if (!isOsStatus(createOrdemServicoDto.statusOperacional)) {
      throw new BadRequestException(`Status de OS invalido: ${createOrdemServicoDto.statusOperacional}`);
    }
    if (createOrdemServicoDto.statusOperacional !== OS_STATUS.ABERTA) {
      throw new BadRequestException('Toda OS deve começar como aberta. Avance pelas etapas autorizadas após a criação.');
    }
    const orcamentoId = createOrdemServicoDto.orcamentoId;
    if (!orcamentoId) throw new BadRequestException('Selecione um orçamento aprovado antes de criar a OS.');

    await this.assertReferenciasDaEmpresa(createOrdemServicoDto, scopedEmpresaId);

    const origem = await bloquearOrigem(this.ordemServicoModel.db, 'Orcamento', orcamentoId, scopedEmpresaId);
    if (origem.status !== ORCAMENTO_STATUS.APROVADO) {
      throw new BadRequestException('A OS só pode ser criada depois da aprovação do orçamento.');
    }
    const recebimento = await bloquearOrigem(this.ordemServicoModel.db, 'RecebimentoEquipamento', createOrdemServicoDto.recebimentoEquipamentoId, scopedEmpresaId);
    if (recebimento.resultadoAtendimento === 'sem_reparo') {
      throw new BadRequestException('Este atendimento foi encerrado sem reparo e nao pode receber uma nova OS.');
    }
    if (String(origem.clienteId) !== createOrdemServicoDto.clienteId || String(origem.recebimentoEquipamentoId) !== createOrdemServicoDto.recebimentoEquipamentoId) {
      throw new BadRequestException('Cliente e equipamento devem corresponder ao orçamento aprovado.');
    }

    const existentes = await this.ordemServicoModel.find({ orcamentoId, empresaId: scopedEmpresaId }).limit(2).exec();
    if (existentes.length > 1) throw new ConflictException('Há mais de uma OS para este orçamento. Solicite conferência dos vínculos antes de continuar.');
    if (existentes[0]) {
      if (String(existentes[0].clienteId) !== createOrdemServicoDto.clienteId || String(existentes[0].recebimentoEquipamentoId) !== createOrdemServicoDto.recebimentoEquipamentoId) throw new ConflictException('A OS existente tem vínculos divergentes. Solicite conferência.');
      const existente = await this.findOne(String(existentes[0]._id), scopedEmpresaId);
      if (!existente) throw new ConflictException('A OS mudou durante a consulta. Tente novamente.');
      return existente;
    }

    const numero = await gerarProtocoloOperacional(this.ordemServicoModel.db, scopedEmpresaId, 'OS');
    const createdOrdemServico = new this.ordemServicoModel({
      ...createOrdemServicoDto,
      empresaId: scopedEmpresaId,
      categoriaEquipamento: normalizarCategoriaEquipamento(recebimento.categoriaEquipamento, recebimento.tipoEquipamento),
      numero,
    });
    const saved = await createdOrdemServico.save();

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: scopedEmpresaId,
      usuarioId: this.getActorId(user, createOrdemServicoDto.tecnicoId),
      tipoEvento: AUDITORIA_EVENTOS.OS_CRIADA,
      entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
      entidadeId: saved._id as Types.ObjectId,
      dados: {
        numero,
        status: createOrdemServicoDto.statusOperacional,
        categoriaEquipamento: normalizarCategoriaEquipamento(recebimento.categoriaEquipamento, recebimento.tipoEquipamento),
        clienteId: createOrdemServicoDto.clienteId,
        orcamentoId: createOrdemServicoDto.orcamentoId,
        ...(createOrdemServicoDto.dataPrevistaEntrega ? { dataPrevistaEntrega: createOrdemServicoDto.dataPrevistaEntrega } : {}),
      },
    });

    return saved;
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.ordemServicoModel
      .find({ empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate({ path: 'tecnicoId', select: 'nome email perfil', match: { empresaId } })
      .populate({ path: 'recebimentoEquipamentoId', select: 'categoriaEquipamento tipoEquipamento marca modelo imeiOuSerial', match: { empresaId } })
      .populate({ path: 'orcamentoId', select: 'total status validade', match: { empresaId } })
      .exec();
  }

  async findAllPaginado(empresaId: string | undefined, query: Record<string, unknown>) {
    this.assertEmpresaInformada(empresaId);
    const consulta = lerConsultaListaOperacional(query);
    const filtro: Record<string, unknown> = { empresaId };
    if (consulta.status) filtro.statusOperacional = consulta.status;
    if (consulta.prioridade) filtro.prioridade = consulta.prioridade;
    if (consulta.busca) {
      const regex = buscaLiteralRegex(consulta.busca);
      const [clientes, tecnicos, recebimentos] = await Promise.all([
        this.ordemServicoModel.db.model('Cliente').find({ empresaId, $or: [{ nome: regex }, { cpfCnpj: regex }] }).distinct('_id').exec(),
        this.ordemServicoModel.db.model('Usuario').find({ empresaId, nome: regex }).distinct('_id').exec(),
        this.ordemServicoModel.db.model('RecebimentoEquipamento').find({ empresaId, $or: [{ tipoEquipamento: regex }, { marca: regex }, { modelo: regex }, { imeiOuSerial: regex }] }).distinct('_id').exec(),
      ]);
      filtro.$or = [
        { numero: regex },
        ...(clientes.length ? [{ clienteId: { $in: clientes } }] : []),
        ...(tecnicos.length ? [{ tecnicoId: { $in: tecnicos } }] : []),
        ...(recebimentos.length ? [{ recebimentoEquipamentoId: { $in: recebimentos } }] : []),
      ];
    }
    const [itens, total] = await Promise.all([
      this.ordemServicoModel.find(filtro).sort({ criadoEm: -1, _id: -1 }).skip((consulta.pagina - 1) * consulta.limite).limit(consulta.limite)
        .populate('empresaId', 'nomeFantasia razaoSocial')
        .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
        .populate({ path: 'tecnicoId', select: 'nome email perfil', match: { empresaId } })
        .populate({ path: 'recebimentoEquipamentoId', select: 'categoriaEquipamento numero tipoEquipamento marca modelo imeiOuSerial', match: { empresaId } })
        .populate({ path: 'orcamentoId', select: 'numero total status validade', match: { empresaId } }).exec(),
      this.ordemServicoModel.countDocuments(filtro).exec(),
    ]);
    return respostaListaOperacional(itens, total, consulta);
  }

  findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.ordemServicoModel
      .findOne({ _id: id, empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate({ path: 'tecnicoId', select: 'nome email perfil', match: { empresaId } })
      .populate({ path: 'recebimentoEquipamentoId', select: 'categoriaEquipamento tipoEquipamento marca modelo imeiOuSerial', match: { empresaId } })
      .populate({ path: 'orcamentoId', select: 'total status validade', match: { empresaId } })
      .populate({ path: 'checklistQualidadeAtualizadaPor', select: 'nome email', match: { empresaId } })
      .populate({ path: 'checklistQualidadeCorrigidoPor', select: 'nome email', match: { empresaId } })
      .exec();
  }

  findByOrcamento(orcamentoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const query = { orcamentoId, empresaId };
    return this.ordemServicoModel
      .findOne(query)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate({ path: 'tecnicoId', select: 'nome email perfil', match: { empresaId } })
      .populate({ path: 'recebimentoEquipamentoId', select: 'categoriaEquipamento tipoEquipamento marca modelo imeiOuSerial', match: { empresaId } })
      .populate({ path: 'orcamentoId', select: 'total status validade', match: { empresaId } })
      .exec();
  }

  async update(id: string, updateOrdemServicoDto: UpdateOrdemServicoDto, empresaId?: string, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.ordemServicoModel.db, () => this.updateAtomic(id, updateOrdemServicoDto, empresaId, user));
  }

  private async updateAtomic(id: string, updateOrdemServicoDto: UpdateOrdemServicoDto, empresaId?: string, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }
    const recebimento = await bloquearOrigem(this.ordemServicoModel.db, 'RecebimentoEquipamento', ordemServico.recebimentoEquipamentoId, empresaId);
    if (recebimento.resultadoAtendimento === 'sem_reparo') {
      throw new BadRequestException('Este atendimento foi encerrado sem reparo e nao pode ter a OS alterada.');
    }

    const nextStatus = updateOrdemServicoDto.statusOperacional;
    const hasNonStatusChanges = Object.keys(updateOrdemServicoDto).some((key) => key !== 'statusOperacional');
    const hasPrevisaoUpdate = Object.prototype.hasOwnProperty.call(updateOrdemServicoDto, 'dataPrevistaEntrega');
    const dataPrevistaEntrega = updateOrdemServicoDto.dataPrevistaEntrega
      ? new Date(updateOrdemServicoDto.dataPrevistaEntrega)
      : undefined;
    if (dataPrevistaEntrega && Number.isNaN(dataPrevistaEntrega.getTime())) {
      throw new BadRequestException('Data de previsão de entrega inválida.');
    }
    const previsaoAnterior = ordemServico.dataPrevistaEntrega?.toISOString();
    const previsaoAtual = dataPrevistaEntrega?.toISOString();
    const previsaoAlterada = hasPrevisaoUpdate && previsaoAnterior !== previsaoAtual;

    if (nextStatus) {
      assertCanTransitionOs(ordemServico.statusOperacional, nextStatus);
    }

    if (nextStatus === OS_STATUS.CONCLUIDA && ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA) {
      this.assertChecklistQualidadePronto(
        ordemServico.checklistQualidade,
        ordemServico.categoriaEquipamento || recebimento.categoriaEquipamento,
        recebimento.tipoEquipamento,
      );
    }

    if (hasNonStatusChanges) {
      assertCanEditOs(ordemServico.statusOperacional);
    }

    await this.assertReferenciasDaEmpresa(updateOrdemServicoDto, empresaId);

    const quoteId = updateOrdemServicoDto.orcamentoId ?? ordemServico.orcamentoId;
    if (quoteId && ['orcamentoId', 'clienteId', 'recebimentoEquipamentoId'].some(key => Object.prototype.hasOwnProperty.call(updateOrdemServicoDto, key))) {
      const origem = await bloquearOrigem(this.ordemServicoModel.db, 'Orcamento', quoteId, empresaId);
      if (String(origem.status) !== ORCAMENTO_STATUS.APROVADO) throw new BadRequestException('A OS só pode permanecer vinculada a um orçamento aprovado.');
      if (String(origem.clienteId) !== String(updateOrdemServicoDto.clienteId ?? ordemServico.clienteId) || String(origem.recebimentoEquipamentoId) !== String(updateOrdemServicoDto.recebimentoEquipamentoId ?? ordemServico.recebimentoEquipamentoId)) throw new BadRequestException('Cliente e equipamento devem corresponder ao orçamento.');
      if (await this.ordemServicoModel.exists({ empresaId, orcamentoId: quoteId, _id: { $ne: id } }).exec()) throw new ConflictException('Já existe outra OS vinculada a este orçamento. Confira os vínculos.');
    }

    const updated = await this.ordemServicoModel
      .findOneAndUpdate({ _id: id, empresaId }, { ...updateOrdemServicoDto, empresaId, dataConclusao: nextStatus === OS_STATUS.CONCLUIDA && ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA ? new Date() : ordemServico.dataConclusao }, { new: true })
      .exec();

    if (nextStatus && nextStatus !== ordemServico.statusOperacional) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordemServico.empresaId,
        usuarioId: this.getActorId(user, ordemServico.tecnicoId?.toString()),
        tipoEvento: AUDITORIA_EVENTOS.OS_STATUS_ALTERADO,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordemServico._id as Types.ObjectId,
        dados: {
          statusAnterior: ordemServico.statusOperacional,
          statusAtual: nextStatus,
        },
      });
    }

    if (previsaoAlterada) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordemServico.empresaId,
        usuarioId: this.getActorId(user, ordemServico.tecnicoId?.toString()),
        tipoEvento: AUDITORIA_EVENTOS.OS_PREVISAO_ENTREGA_ALTERADA,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordemServico._id as Types.ObjectId,
        dados: {
          numero: ordemServico.numero,
          dataAnterior: previsaoAnterior,
          dataAtual: previsaoAtual ?? null,
        },
      });
    }

    return updated;
  }

  async salvarChecklistQualidade(id: string, dto: RegistrarChecklistQualidadeOsDto, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.ordemServicoModel.db, async () => {
      this.assertEmpresaInformada(user?.empresaId);
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Ordem de serviço inválida.');
      const ordem = await this.ordemServicoModel.findOne({ _id: id, empresaId: user?.empresaId }).exec();
      if (!ordem) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (ordem.statusOperacional !== OS_STATUS.EM_EXECUCAO) {
        throw new BadRequestException('O checklist de qualidade pode ser registrado quando a OS estiver em reparo.');
      }

      const recebimento = await bloquearOrigem(this.ordemServicoModel.db, 'RecebimentoEquipamento', ordem.recebimentoEquipamentoId, user?.empresaId);
      const codigosPermitidos = new Set(codigosChecklistQualidade(
        ordem.categoriaEquipamento || recebimento.categoriaEquipamento,
        recebimento.tipoEquipamento,
      ));
      const codigos = new Set<string>();
      const itens = dto.itens.map((item) => {
        if (!codigosPermitidos.has(item.codigo)) {
          throw new BadRequestException('O checklist contém um teste que não se aplica à categoria deste equipamento.');
        }
        if (codigos.has(item.codigo)) throw new BadRequestException('Cada item do checklist pode aparecer uma única vez.');
        codigos.add(item.codigo);
        const observacao = item.observacao?.trim();
        if (item.resultado === 'falha' && (!observacao || observacao.length < 5)) {
          throw new BadRequestException('Descreva a falha com pelo menos 5 caracteres antes de salvar.');
        }
        return {
          codigo: item.codigo,
          resultado: item.resultado,
          ...(observacao ? { observacao } : {}),
        };
      });
      const atualizadoEm = new Date();
      const revisaoAtual = ordem.checklistQualidadeRevisao ?? 0;
      const query = {
        _id: ordem._id,
        empresaId: user?.empresaId,
        statusOperacional: ordem.statusOperacional,
        $or: [
          { checklistQualidadeRevisao: revisaoAtual },
          ...(revisaoAtual === 0 ? [{ checklistQualidadeRevisao: { $exists: false } }] : []),
        ],
      };
      const atualizado = await this.ordemServicoModel.findOneAndUpdate(query, {
        $set: {
          checklistQualidade: itens,
          checklistQualidadeAtualizadaEm: atualizadoEm,
          checklistQualidadeAtualizadaPor: this.getActorId(user, ordem.tecnicoId?.toString()),
        },
        $inc: { checklistQualidadeRevisao: 1 },
      }, { new: true }).exec();
      if (!atualizado) throw new ConflictException('O checklist foi alterado em outra sessão. Recarregue a OS antes de salvar novamente.');

      const formatarItens = (registros: typeof ordem.checklistQualidade) => (registros || []).map((item) => {
        const resultado = item.resultado === 'aprovado' ? 'Aprovado' : item.resultado === 'falha' ? 'Falha' : 'Não se aplica';
        return `${CHECKLIST_QUALIDADE_ROTULOS[item.codigo as keyof typeof CHECKLIST_QUALIDADE_ROTULOS] || item.codigo}: ${resultado}${item.observacao ? ` (${item.observacao})` : ''}`;
      }).join(' · ');
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordem.empresaId,
        usuarioId: this.getActorId(user, ordem.tecnicoId?.toString()),
        tipoEvento: AUDITORIA_EVENTOS.OS_CHECKLIST_QUALIDADE_ATUALIZADO,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordem._id as Types.ObjectId,
        dados: {
          numero: ordem.numero,
          categoriaEquipamento: normalizarCategoriaEquipamento(ordem.categoriaEquipamento || recebimento.categoriaEquipamento, recebimento.tipoEquipamento),
          checklistAnterior: formatarItens(ordem.checklistQualidade),
          checklistAtual: formatarItens(itens),
          checklistAnteriorItens: (ordem.checklistQualidade || []).map((item) => ({ codigo: item.codigo, resultado: item.resultado, observacao: item.observacao })),
          checklistAtualItens: itens.map((item) => ({ codigo: item.codigo, resultado: item.resultado, observacao: item.observacao })),
          itensRegistrados: itens.length,
          falhasRegistradas: itens.filter((item) => item.resultado === 'falha').length,
          revisaoAnterior: revisaoAtual,
          revisaoAtual: revisaoAtual + 1,
        },
      });
      return atualizado;
    });
  }

  async corrigirChecklistQualidade(id: string, dto: RegistrarCorrecaoChecklistQualidadeDto, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.ordemServicoModel.db, async () => {
      this.assertEmpresaInformada(user?.empresaId);
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Ordem de serviço inválida.');
      const ordem = await this.ordemServicoModel.findOne({ _id: id, empresaId: user?.empresaId }).exec();
      if (!ordem) throw new NotFoundException('Ordem de serviço não encontrada.');
      if (ordem.statusOperacional !== OS_STATUS.CONCLUIDA) {
        throw new BadRequestException('A nova revisão só pode ser registrada depois da conclusão da OS.');
      }
      if (!ordem.checklistQualidade?.length) {
        throw new BadRequestException('Esta OS não possui checklist anterior para corrigir.');
      }

      const recebimento = await bloquearOrigem(this.ordemServicoModel.db, 'RecebimentoEquipamento', ordem.recebimentoEquipamentoId, user?.empresaId);
      const codigosEsperados = codigosChecklistQualidade(
        ordem.categoriaEquipamento || recebimento.categoriaEquipamento,
        recebimento.tipoEquipamento,
      );
      const codigosPermitidos = new Set<string>(codigosEsperados);
      const validarVersaoAnterior = (registros: typeof ordem.checklistQualidade) => {
        const quantidades = new Map<string, number>();
        (registros || []).forEach((item) => quantidades.set(item.codigo, (quantidades.get(item.codigo) || 0) + 1));
        const basePendente = CHECKLIST_QUALIDADE_BASE.filter((codigo) => !quantidades.has(codigo));
        const duplicados = [...quantidades.values()].filter((quantidade) => quantidade > 1);
        const desconhecidos = [...quantidades.keys()].filter((codigo) => !(CHECKLIST_QUALIDADE_TODOS as readonly string[]).includes(codigo));
        if (basePendente.length || duplicados.length || desconhecidos.length) {
          throw new BadRequestException('O checklist anterior está incompleto ou contém testes inválidos; peça uma conferência antes de corrigir.');
        }
      };
      const validarNovaRevisao = (registros: typeof ordem.checklistQualidade) => {
        const quantidades = new Map<string, number>();
        (registros || []).forEach((item) => quantidades.set(item.codigo, (quantidades.get(item.codigo) || 0) + 1));
        const faltantes = codigosEsperados.filter((codigo) => !quantidades.has(codigo));
        const duplicados = codigosEsperados.filter((codigo) => (quantidades.get(codigo) || 0) > 1);
        const inesperados = [...quantidades.keys()].filter((codigo) => !codigosPermitidos.has(codigo));
        if (faltantes.length || duplicados.length || inesperados.length || quantidades.size !== codigosEsperados.length) {
          throw new BadRequestException('A correção precisa conter exatamente um resultado para cada item exigido pela categoria do equipamento.');
        }
      };
      validarVersaoAnterior(ordem.checklistQualidade);

      const codigos = new Set<string>();
      const itens = dto.itens.map((item) => {
        if (!codigosPermitidos.has(item.codigo)) {
          throw new BadRequestException('A correção contém um teste que não se aplica à categoria deste equipamento.');
        }
        if (codigos.has(item.codigo)) throw new BadRequestException('Cada item do checklist pode aparecer uma única vez.');
        codigos.add(item.codigo);
        const observacao = item.observacao?.trim();
        if (item.resultado === 'falha' && (!observacao || observacao.length < 5)) {
          throw new BadRequestException('Descreva a falha com pelo menos 5 caracteres antes de registrar a correção.');
        }
        return {
          codigo: item.codigo,
          resultado: item.resultado,
          ...(observacao ? { observacao } : {}),
        };
      });
      validarNovaRevisao(itens);

      const motivo = dto.motivo.trim();
      if (motivo.length < 10) throw new BadRequestException('Informe uma justificativa com pelo menos 10 caracteres.');
      const revisaoAtual = ordem.checklistQualidadeRevisao ?? 0;
      if (dto.revisaoEsperada !== revisaoAtual) {
        throw new ConflictException('O checklist foi atualizado em outra sessão. Recarregue a OS antes de corrigir.');
      }
      const atorId = this.getActorId(user, ordem.tecnicoId?.toString());
      const corrigidoEm = new Date();
      const atualizado = await this.ordemServicoModel.findOneAndUpdate({
        _id: ordem._id,
        empresaId: user?.empresaId,
        statusOperacional: OS_STATUS.CONCLUIDA,
        $or: [
          { checklistQualidadeRevisao: revisaoAtual },
          ...(revisaoAtual === 0 ? [{ checklistQualidadeRevisao: { $exists: false } }] : []),
        ],
      }, {
        $set: {
          checklistQualidade: itens,
          checklistQualidadeAtualizadaEm: corrigidoEm,
          checklistQualidadeAtualizadaPor: atorId,
          checklistQualidadeCorrecaoMotivo: motivo,
          checklistQualidadeCorrigidoEm: corrigidoEm,
          checklistQualidadeCorrigidoPor: atorId,
        },
        $inc: { checklistQualidadeRevisao: 1 },
      }, { new: true }).exec();
      if (!atualizado) throw new ConflictException('A OS ou o checklist mudou em outra sessão. Recarregue antes de corrigir.');

      const formatarItens = (registros: typeof ordem.checklistQualidade) => (registros || []).map((item) => {
        const resultado = item.resultado === 'aprovado' ? 'Aprovado' : item.resultado === 'falha' ? 'Falha' : 'Não se aplica';
        return `${CHECKLIST_QUALIDADE_ROTULOS[item.codigo as keyof typeof CHECKLIST_QUALIDADE_ROTULOS] || item.codigo}: ${resultado}${item.observacao ? ` (${item.observacao})` : ''}`;
      }).join(' · ');
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordem.empresaId,
        usuarioId: atorId,
        tipoEvento: AUDITORIA_EVENTOS.OS_CHECKLIST_QUALIDADE_CORRIGIDO,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordem._id as Types.ObjectId,
        dados: {
          numero: ordem.numero,
          categoriaEquipamento: normalizarCategoriaEquipamento(ordem.categoriaEquipamento || recebimento.categoriaEquipamento, recebimento.tipoEquipamento),
          checklistAnterior: formatarItens(ordem.checklistQualidade),
          checklistAtual: formatarItens(itens),
          checklistAnteriorItens: (ordem.checklistQualidade || []).map((item) => ({ codigo: item.codigo, resultado: item.resultado, observacao: item.observacao })),
          checklistAtualItens: itens.map((item) => ({ codigo: item.codigo, resultado: item.resultado, observacao: item.observacao })),
          motivo,
          revisaoAnterior: revisaoAtual,
          revisaoAtual: revisaoAtual + 1,
          falhasRegistradas: itens.filter((item) => item.resultado === 'falha').length,
        },
      });
      return atualizado;
    });
  }

  private assertChecklistQualidadePronto(itens?: OrdemServico['checklistQualidade'], categoria?: string, tipoEquipamento?: string) {
    const codigosEsperados = codigosChecklistQualidade(categoria, tipoEquipamento);
    const resultados = new Map<string, OrdemServico['checklistQualidade']>();
    (itens || []).forEach((item) => resultados.set(item.codigo, [...(resultados.get(item.codigo) || []), item]));
    const pendentes = codigosEsperados.filter((codigo) => !resultados.has(codigo));
    const falhas = codigosEsperados.filter((codigo) => resultados.get(codigo)?.some((item) => item.resultado === 'falha'));
    const duplicados = codigosEsperados.filter((codigo) => (resultados.get(codigo)?.length || 0) > 1);
    const esperados = new Set<string>(codigosEsperados);
    const inesperados = [...resultados.keys()].filter((codigo) => !esperados.has(codigo));
    if (pendentes.length || falhas.length || duplicados.length || inesperados.length) {
      const detalhes = [
        pendentes.length ? `${pendentes.length} item(ns) sem resultado` : '',
        duplicados.length ? `${duplicados.length} item(ns) duplicado(s)` : '',
        inesperados.length ? `${inesperados.length} teste(s) fora da categoria` : '',
        falhas.length ? `${falhas.length} falha(s) ainda não resolvida(s)` : '',
      ].filter(Boolean).join(' e ');
      throw new BadRequestException(`Conclua o checklist de qualidade antes de finalizar: ${detalhes}.`);
    }
  }

  async remove(id: string, empresaId?: string, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    assertCanEditOs(ordemServico.statusOperacional);
    return this.update(id, { statusOperacional: OS_STATUS.CANCELADA }, empresaId, user);
  }

  async registrarEntrega(id: string, dto: RegistrarEntregaOsDto, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.ordemServicoModel.db, () => this.registrarEntregaAtomic(id, dto, user));
  }

  private async registrarEntregaAtomic(id: string, dto: RegistrarEntregaOsDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId: user?.empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    if (ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA) {
      throw new BadRequestException('A assinatura de entrega so pode ser registrada em OS concluida.');
    }
    if (!dto.entregueParaTipo) {
      throw new BadRequestException('Informe se quem retira e o cliente ou um terceiro autorizado.');
    }
    if (dto.entregueParaTipo === 'terceiro_autorizado' && dto.autorizacaoTerceiroConfirmada !== true) {
      throw new BadRequestException('Confirme que o cliente autorizou a retirada pelo terceiro antes de registrar a entrega.');
    }
    if (dto.entregueParaTipo === 'cliente' && dto.autorizacaoTerceiroConfirmada) {
      throw new BadRequestException('A confirmação de terceiro autorizado só deve ser marcada quando outra pessoa retirar o equipamento.');
    }
    const entregueParaNome = dto.entregueParaNome.trim();
    if (entregueParaNome.length < 2) throw new BadRequestException('Informe o nome de quem recebeu o equipamento.');
    const assinaturaEntregaHashSha256 = createHash('sha256')
      .update(dto.assinaturaImagemBase64, 'utf8')
      .digest('hex');
    if (ordemServico.dataEntrega || ordemServico.assinaturaEntregaHashSha256) {
      if (ordemServico.entregueParaNome === entregueParaNome
        && ordemServico.entregueParaTipo === dto.entregueParaTipo
        && ordemServico.entregueParaDocumento === dto.entregueParaDocumento
        && ordemServico.assinaturaEntregaHashSha256 === assinaturaEntregaHashSha256
        && (ordemServico.observacoesEntrega || undefined) === (dto.observacoesEntrega?.trim() || undefined)) return ordemServico;
      throw new ConflictException('A retirada ja foi registrada. Preserve o comprovante e encaminhe qualquer correcao a uma pessoa responsavel.');
    }

    const venda = await this.vendaModel
      .findOneAndUpdate({ origemTipo: 'ordem_servico', origemId: new Types.ObjectId(id), empresaId: user?.empresaId }, { $inc: { __v: 1 } }, { new: true })
      .exec();

    if (!venda) {
      throw new BadRequestException('Gere a venda vinculada a esta OS antes de registrar a entrega.');
    }

    const totalPagoCentavos = await totalPagamentosValidosCentavos(this.vendaModel.db, String(venda._id), String(venda.empresaId));
    if (venda.statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO ||
      calcularStatusFinanceiroVenda(venda.total, totalPagoCentavos / 100) !== VENDA_STATUS_FINANCEIRO.PAGO) {
      throw new BadRequestException('Registre o pagamento total da venda antes de entregar o equipamento.');
    }

    const updated = await this.ordemServicoModel.findOneAndUpdate(
      { _id: id, empresaId: user?.empresaId },
      {
        dataEntrega: new Date(),
        entregueParaNome,
        entregueParaTipo: dto.entregueParaTipo,
        autorizacaoTerceiroConfirmada: dto.entregueParaTipo === 'terceiro_autorizado',
        autorizadoPorClienteId: dto.entregueParaTipo === 'terceiro_autorizado' ? ordemServico.clienteId : undefined,
        autorizacaoTerceiroRegistradaEm: dto.entregueParaTipo === 'terceiro_autorizado' ? new Date() : undefined,
        entregueParaDocumento: dto.entregueParaDocumento,
        assinaturaEntregaImagemBase64: dto.assinaturaImagemBase64,
        assinaturaEntregaHashSha256,
        ipAssinaturaEntrega: dto.ipAssinaturaEntrega,
        userAgentAssinaturaEntrega: dto.userAgentAssinaturaEntrega,
        observacoesEntrega: dto.observacoesEntrega,
      },
      { new: true },
    ).exec();

    const usuarioId = this.getActorId(user, ordemServico.tecnicoId?.toString());
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: ordemServico.empresaId,
      usuarioId,
      tipoEvento: AUDITORIA_EVENTOS.OS_ENTREGA_ASSINADA,
      entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
      entidadeId: ordemServico._id as Types.ObjectId,
      dados: {
        clienteId: ordemServico.clienteId?.toString(),
        entregueParaNome,
        entregueParaTipo: dto.entregueParaTipo,
        autorizacaoTerceiroConfirmada: dto.entregueParaTipo === 'terceiro_autorizado',
        entregueParaDocumento: dto.entregueParaDocumento,
        dataEntrega: new Date().toISOString(),
        assinaturaEntregaHashSha256,
      },
    });

    return updated;
  }

  async createItem(
    createItensUtilizadosOSDto: CreateItensUtilizadosOSDto,
    options: { skipSaldoCheck?: boolean } = {},
    empresaId?: string,
    user?: CurrentUserPayload,
  ) {
    const ordemServico = await this.assertOsCanConsumeItem(createItensUtilizadosOSDto.ordemServicoId, empresaId);
    const actorId = this.getActorId(user, ordemServico.tecnicoId?.toString());
    if (!options.skipSaldoCheck) {
      await this.estoqueService.assertSaldoDisponivel(
        createItensUtilizadosOSDto.produtoId,
        createItensUtilizadosOSDto.quantidade,
        0,
        ordemServico.empresaId.toString(),
      );
    }

    const createdItem = new this.itensUtilizadosOSModel(createItensUtilizadosOSDto);
    const saved = await createdItem.save();

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: createItensUtilizadosOSDto.produtoId,
        quantidade: createItensUtilizadosOSDto.quantidade,
        tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS,
        usuarioId: actorId,
      });

      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordemServico.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.PECA_CONSUMIDA,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordemServico._id as Types.ObjectId,
        dados: {
          itemUtilizadoId: saved._id?.toString(),
          produtoId: createItensUtilizadosOSDto.produtoId,
          quantidade: createItensUtilizadosOSDto.quantidade,
        },
      });
    }

    return saved;
  }

  async reservarPeca(createPecaReservadaOSDto: CreatePecaReservadaOSDto, empresaId?: string, user?: CurrentUserPayload) {
    const ordemServico = await this.assertOsCanReserveItem(createPecaReservadaOSDto.ordemServicoId, empresaId);
    const actorId = this.getActorId(user, ordemServico.tecnicoId?.toString());
    await this.estoqueService.assertSaldoDisponivel(
      createPecaReservadaOSDto.produtoId,
      createPecaReservadaOSDto.quantidade,
      0,
      ordemServico.empresaId.toString(),
    );
    const createdReserva = new this.pecasReservadasOSModel(createPecaReservadaOSDto);
    const saved = await createdReserva.save();

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: createPecaReservadaOSDto.produtoId,
      quantidade: createPecaReservadaOSDto.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS,
      usuarioId: actorId,
    });

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: ordemServico.empresaId,
      usuarioId: actorId,
      tipoEvento: AUDITORIA_EVENTOS.PECA_RESERVADA,
      entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
      entidadeId: ordemServico._id as Types.ObjectId,
      dados: {
        reservaId: saved._id?.toString(),
        produtoId: createPecaReservadaOSDto.produtoId,
        quantidade: createPecaReservadaOSDto.quantidade,
      },
    });

    return saved;
  }

  async findReservasByOs(ordemServicoId: string, empresaId?: string) {
    await this.assertOsDaEmpresa(ordemServicoId, empresaId);
    return this.pecasReservadasOSModel
      .find({ ordemServicoId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async findReservasPendentes(empresaId?: string) {
    const ordemServicoIds = await this.getOrdemServicoIdsDaEmpresa(empresaId);
    return this.pecasReservadasOSModel
      .find({ ordemServicoId: { $in: ordemServicoIds } })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('ordemServicoId', 'numero statusOperacional prioridade dataEntrada clienteId')
      .exec();
  }

  async consumirReserva(reservaId: string, empresaId?: string, user?: CurrentUserPayload) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanConsumeItem(reserva.ordemServicoId.toString(), empresaId);
    const actorId = this.getActorId(user, ordemServico.tecnicoId?.toString());
    const reservaConsumida = await this.pecasReservadasOSModel.findOneAndDelete({ _id: reservaId }).exec();
    if (!reservaConsumida) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reservaConsumida.produtoId.toString(),
      quantidade: reservaConsumida.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
      usuarioId: actorId,
    });

    const item = await this.createItem(
      {
        ordemServicoId: reservaConsumida.ordemServicoId.toString(),
        produtoId: reservaConsumida.produtoId.toString(),
        quantidade: reservaConsumida.quantidade,
      },
      { skipSaldoCheck: true },
      ordemServico.empresaId.toString(),
      user,
    );

    return item;
  }

  async removerReserva(reservaId: string, empresaId?: string, user?: CurrentUserPayload) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanReserveItem(reserva.ordemServicoId.toString(), empresaId);
    const actorId = this.getActorId(user, ordemServico.tecnicoId?.toString());
    const reservaRemovida = await this.pecasReservadasOSModel.findOneAndDelete({ _id: reservaId }).exec();
    if (!reservaRemovida) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reservaRemovida.produtoId.toString(),
      quantidade: reservaRemovida.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
      usuarioId: actorId,
    });

    return reservaRemovida;
  }

  async findAllItems(empresaId?: string) {
    const ordemServicoIds = await this.getOrdemServicoIdsDaEmpresa(empresaId);
    return this.itensUtilizadosOSModel.find({ ordemServicoId: { $in: ordemServicoIds } }).exec();
  }

  async findItemsByOs(ordemServicoId: string, empresaId?: string) {
    await this.assertOsDaEmpresa(ordemServicoId, empresaId);
    return this.itensUtilizadosOSModel
      .find({ ordemServicoId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async findOneItem(id: string, empresaId?: string) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      return null;
    }

    await this.assertOsDaEmpresa(item.ordemServicoId.toString(), empresaId);
    return item;
  }

  async updateItem(id: string, updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto, empresaId?: string, user?: CurrentUserPayload) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString(), empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: item.ordemServicoId, empresaId }).exec();
    const actorId = this.getActorId(user, ordemServico?.tecnicoId?.toString());
    const produtoAnteriorId = item.produtoId.toString();
    const quantidadeAnterior = item.quantidade;
    const produtoAtualId = updateItensUtilizadosOSDto.produtoId ?? produtoAnteriorId;
    const quantidadeAtual = updateItensUtilizadosOSDto.quantidade ?? quantidadeAnterior;
    const saldoAdicional = produtoAtualId === produtoAnteriorId ? quantidadeAnterior : 0;

    await this.estoqueService.assertSaldoDisponivel(produtoAtualId, quantidadeAtual, saldoAdicional, empresaId);

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: produtoAnteriorId,
        quantidade: quantidadeAnterior,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS,
        usuarioId: actorId,
      });
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: produtoAtualId,
        quantidade: quantidadeAtual,
        tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS,
        usuarioId: actorId,
      });
    }

    return this.itensUtilizadosOSModel.findByIdAndUpdate(id, updateItensUtilizadosOSDto, { new: true }).exec();
  }

  async removeItem(id: string, empresaId?: string, user?: CurrentUserPayload) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString(), empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: item.ordemServicoId, empresaId }).exec();
    const actorId = this.getActorId(user, ordemServico?.tecnicoId?.toString());

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: item.produtoId.toString(),
        quantidade: item.quantidade,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS,
        usuarioId: actorId,
      });
    }

    return this.itensUtilizadosOSModel.findByIdAndDelete(id).exec();
  }

  private async assertOsCanConsumeItem(ordemServicoId: string, empresaId?: string) {
    const ordemServico = await this.assertOsDaEmpresa(ordemServicoId, empresaId);
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    if (ordemServico.statusOperacional !== OS_STATUS.EM_EXECUCAO) {
      throw new BadRequestException('Pecas so podem ser consumidas em OS em execucao.');
    }

    return ordemServico;
  }

  private async assertOsCanReserveItem(ordemServicoId: string, empresaId?: string) {
    const ordemServico = await this.assertOsDaEmpresa(ordemServicoId, empresaId);

    const statusesPermitidosParaReserva: string[] = [
      OS_STATUS.EM_DIAGNOSTICO,
      OS_STATUS.AGUARDANDO_PECA,
      OS_STATUS.EM_EXECUCAO,
    ];

    if (!statusesPermitidosParaReserva.includes(ordemServico.statusOperacional)) {
      throw new BadRequestException('Pecas so podem ser reservadas em OS em diagnostico, aguardando peca ou em execucao.');
    }

    return ordemServico;
  }

  private async registrarMovimentoEstoqueOs({
    ordemServico,
    produtoId,
    quantidade,
    tipo,
    usuarioId,
  }: {
    ordemServico: OrdemServicoDocument;
    produtoId: string;
    quantidade: number;
    tipo: string;
    usuarioId?: string;
  }) {
    await this.estoqueService.create(
      {
        empresaId: ordemServico.empresaId.toString(),
        produtoId,
        tipo,
        quantidade,
        origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.ORDEM_SERVICO,
        origemId: (ordemServico._id as Types.ObjectId).toString(),
      },
      usuarioId || ordemServico.tecnicoId.toString(),
      ordemServico.empresaId.toString(),
    );
  }

  private async assertOsDaEmpresa(ordemServicoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: ordemServicoId, empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    return ordemServico;
  }

  private async getOrdemServicoIdsDaEmpresa(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const ordens = await this.ordemServicoModel.find({ empresaId }).select('_id').lean().exec();
    return ordens.map((ordem) => ordem._id);
  }

  private getEmpresaIdPermitida(inputEmpresaId: unknown, userEmpresaId?: string) {
    if (userEmpresaId) {
      if (inputEmpresaId && String(inputEmpresaId) !== String(userEmpresaId)) {
        throw new UnauthorizedException('Empresa informada nao pertence ao usuario.');
      }
      return userEmpresaId;
    }

    if (!inputEmpresaId) {
      throw new UnauthorizedException('Empresa da ordem de servico nao informada.');
    }

    return String(inputEmpresaId);
  }

  private async assertReferenciasDaEmpresa(dto: UpdateOrdemServicoDto, empresaId: string) {
    for (const [campo, model] of [
      ['clienteId', 'Cliente'],
      ['tecnicoId', 'Usuario'],
      ['recebimentoEquipamentoId', 'RecebimentoEquipamento'],
      ['orcamentoId', 'Orcamento'],
    ] as const) {
      const id = dto[campo];
      if (campo === 'orcamentoId' && id === null) continue;
      if (id !== undefined) {
        await assertTenantReference(this.ordemServicoModel.db, model, id, empresaId);
      }
    }
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }

  private getActorId(user?: CurrentUserPayload, fallback?: string) {
    const id = user?.id || user?._id || user?.sub || fallback;
    if (!id) throw new UnauthorizedException('Operador autenticado nao identificado para auditoria.');
    return String(id);
  }
}
