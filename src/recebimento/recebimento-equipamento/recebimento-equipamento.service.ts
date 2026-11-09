import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from './recebimento-equipamento.schema';
import { CreateRecebimentoEquipamentoDto } from './dto/create-recebimento-equipamento.dto';
import { UpdateRecebimentoEquipamentoDto } from './dto/update-recebimento-equipamento.dto';
import { CondicoesEquipamento, CondicoesEquipamentoDocument } from '../condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesDocument } from '../componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoDocument } from '../midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoDocument } from '../termos/termos-recebimento.schema';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS, type AuditoriaEvento } from '../../auditoria/auditoria-eventos';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { assertTenantReference } from '../../common/tenant-reference';
import { OrdemServico, OrdemServicoDocument } from '../../ordens-servico/schemas/ordem-servico.schema';
import { Orcamento, OrcamentoDocument } from '../../orcamentos/schemas/orcamento.schema';
import { executarTransacaoFinanceira } from '../../financeiro/vendas/venda-pagamentos-validos';
import { Venda } from '../../financeiro/vendas/schemas/venda.schema';
import { EncerrarSemReparoDto } from './dto/encerrar-sem-reparo.dto';
import { RegistrarDevolucaoDto } from './dto/registrar-devolucao.dto';
import { ORCAMENTO_STATUS } from '../../orcamentos/state/orcamento.states';
import { OS_STATUS } from '../../ordens-servico/state/os.states';
import { RESULTADO_ATENDIMENTO, STATUS_DEVOLUCAO } from './recebimento-fluxo';
import { bloquearOrigem } from '../../common/bloquear-origem';
import { createHash } from 'node:crypto';
import { gerarProtocoloOperacional } from '../../common/protocolo-operacional';
import { buscaLiteralRegex, lerConsultaListaOperacional, respostaListaOperacional } from '../../common/paginacao-operacional';

@Injectable()
export class RecebimentoEquipamentoService {
  constructor(
    @InjectModel(RecebimentoEquipamento.name) private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(CondicoesEquipamento.name) private condicoesEquipamentoModel: Model<CondicoesEquipamentoDocument>,
    @InjectModel(ComponentesAusentes.name) private componentesAusentesModel: Model<ComponentesAusentesDocument>,
    @InjectModel(MidiasRecebimento.name) private midiasRecebimentoModel: Model<MidiasRecebimentoDocument>,
    @InjectModel(TermosRecebimento.name) private termosRecebimentoModel: Model<TermosRecebimentoDocument>,
    private readonly auditoriaService: AuditoriaService,
    @InjectModel(OrdemServico.name) private ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(Orcamento.name) private orcamentoModel: Model<OrcamentoDocument>,
  ) {}

  async create(createRecebimentoEquipamentoDto: CreateRecebimentoEquipamentoDto, user?: CurrentUserPayload) {
    const payload = {
      ...createRecebimentoEquipamentoDto,
      empresaId: user?.empresaId ?? createRecebimentoEquipamentoDto.empresaId,
      recebidoPor: user?.id ?? createRecebimentoEquipamentoDto.recebidoPor,
    };

    this.assertEmpresaInformada(String(payload.empresaId || ''));

    if (user?.empresaId && createRecebimentoEquipamentoDto.empresaId && String(createRecebimentoEquipamentoDto.empresaId) !== user.empresaId) {
      throw new BadRequestException('Recebimento nao pode ser vinculado a outra empresa.');
    }

    return executarTransacaoFinanceira(this.recebimentoEquipamentoModel.db, async () => {
      await assertTenantReference(this.recebimentoEquipamentoModel.db, 'Cliente', payload.clienteId, payload.empresaId);
      const numero = await gerarProtocoloOperacional(this.recebimentoEquipamentoModel.db, String(payload.empresaId), 'REC');
      const createdRecebimentoEquipamento = new this.recebimentoEquipamentoModel({ ...payload, numero });
      const saved = await createdRecebimentoEquipamento.save();

      await this.registrarAuditoriaRecebimento(saved, user, AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO, {
        operacao: 'criado',
        clienteId: payload.clienteId,
        tipoEquipamento: payload.tipoEquipamento,
        categoriaEquipamento: payload.categoriaEquipamento,
        marca: payload.marca,
        modelo: payload.modelo,
        status: payload.status,
        numero,
      });

      return saved;
    });
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.recebimentoEquipamentoModel
      .find(this.getEmpresaQuery(empresaId))
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate('recebidoPor', 'nome email')
      .exec();
  }

  async findAllPaginado(empresaId: string | undefined, query: Record<string, unknown>) {
    this.assertEmpresaInformada(empresaId);
    const consulta = lerConsultaListaOperacional(query);
    const filtro: Record<string, unknown> = { ...this.getEmpresaQuery(empresaId) };
    if (consulta.status) filtro.status = consulta.status;
    if (consulta.resultado === 'sem_reparo') {
      filtro.resultadoAtendimento = 'sem_reparo';
      filtro.statusDevolucao = { $ne: 'devolvido' };
    } else if (consulta.resultado === 'devolvido_sem_reparo') {
      filtro.resultadoAtendimento = 'sem_reparo';
      filtro.statusDevolucao = 'devolvido';
    }
    if (consulta.busca) {
      const regex = buscaLiteralRegex(consulta.busca);
      const clientes = await this.recebimentoEquipamentoModel.db.model('Cliente').find({ empresaId, $or: [{ nome: regex }, { cpfCnpj: regex }] }).distinct('_id').exec();
      filtro.$or = [
        { numero: regex }, { tipoEquipamento: regex }, { marca: regex }, { modelo: regex }, { imeiOuSerial: regex },
        ...(clientes.length ? [{ clienteId: { $in: clientes } }] : []),
      ];
    }
    const [itens, total] = await Promise.all([
      this.recebimentoEquipamentoModel.find(filtro).sort({ criadoEm: -1, _id: -1 }).skip((consulta.pagina - 1) * consulta.limite).limit(consulta.limite)
        .populate('empresaId', 'nomeFantasia razaoSocial')
        .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
        .populate('recebidoPor', 'nome email').exec(),
      this.recebimentoEquipamentoModel.countDocuments(filtro).exec(),
    ]);
    return respostaListaOperacional(itens, total, consulta);
  }

  async findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const recebimento = await this.recebimentoEquipamentoModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .select('+devolucaoAssinaturaImagemBase64')
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate('recebidoPor', 'nome email')
      .lean()
      .exec();

    if (!recebimento) return null;

    const [condicoes, componentesAusentes, midias, termo] = await Promise.all([
      this.condicoesEquipamentoModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.componentesAusentesModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.midiasRecebimentoModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.termosRecebimentoModel.findOne({ recebimentoEquipamentoId: id }).lean().exec(),
    ]);

    return {
      ...recebimento,
      condicoes,
      componentesAusentes,
      midias,
      termo,
    };
  }

  async update(id: string, updateRecebimentoEquipamentoDto: UpdateRecebimentoEquipamentoDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    if (user?.empresaId && updateRecebimentoEquipamentoDto.empresaId && String(updateRecebimentoEquipamentoDto.empresaId) !== user.empresaId) {
      throw new BadRequestException('Recebimento nao pode ser movido para outra empresa.');
    }

    const updatePayload = { ...updateRecebimentoEquipamentoDto };
    delete updatePayload.empresaId;
    if (updatePayload.clienteId !== undefined) {
      await assertTenantReference(this.recebimentoEquipamentoModel.db, 'Cliente', updatePayload.clienteId, user.empresaId);
    }

    const updated = await this.recebimentoEquipamentoModel
      .findOneAndUpdate(this.getEmpresaQuery(user?.empresaId, { _id: id }), updatePayload, { new: true })
      .exec();

    if (updated) {
      await this.registrarAuditoriaRecebimento(updated, user, AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO, {
        operacao: 'atualizado',
        campos: Object.keys(updateRecebimentoEquipamentoDto),
        status: updated.status,
      });
    }

    return updated;
  }

  async encerrarSemReparo(id: string, dto: EncerrarSemReparoDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    return executarTransacaoFinanceira(this.recebimentoEquipamentoModel.db, async () => {
      const query = this.getEmpresaQuery(user?.empresaId, { _id: id });
      const origem = await bloquearOrigem(this.recebimentoEquipamentoModel.db, 'RecebimentoEquipamento', id, user?.empresaId);
      const recebimento = await this.recebimentoEquipamentoModel.findOne(query).exec();
      if (!recebimento) throw new NotFoundException('Recebimento nao encontrado.');

      const motivo = dto.motivo.trim();
      if (motivo.length < 5) throw new BadRequestException('Informe um motivo com pelo menos 5 caracteres.');
      if (recebimento.resultadoAtendimento === RESULTADO_ATENDIMENTO.SEM_REPARO) {
        if (recebimento.motivoSemReparo === motivo) return recebimento;
        throw new ConflictException('Este atendimento ja foi encerrado sem reparo. Solicite a correcao por uma pessoa responsavel.');
      }
      if (recebimento.estadoSalvamento === 'pendente_midias') {
        throw new BadRequestException('Conclua o envio das midias pendentes antes de encerrar o atendimento.');
      }

      const [orcamentos, ordensServico] = await Promise.all([
        this.orcamentoModel.find({ empresaId: user?.empresaId, recebimentoEquipamentoId: id }).lean().exec(),
        this.ordemServicoModel.find({ empresaId: user?.empresaId, recebimentoEquipamentoId: id }).lean().exec(),
      ]);
      const statusOrcamentoEmAberto = new Set<string>([ORCAMENTO_STATUS.RASCUNHO, ORCAMENTO_STATUS.ENVIADO]);
      if (orcamentos.some((orcamento) => statusOrcamentoEmAberto.has(orcamento.status))) {
        throw new BadRequestException('Conclua ou cancele os orcamentos em aberto antes de encerrar sem reparo.');
      }
      if (ordensServico.some((ordem) => ordem.statusOperacional !== OS_STATUS.CANCELADA)) {
        throw new BadRequestException('Cancele a OS antes de registrar o encerramento sem reparo.');
      }

      const idsOrdemServico = ordensServico.map((ordem) => ordem._id);
      const idsOrcamento = orcamentos.map((orcamento) => orcamento._id);
      if (idsOrdemServico.length || idsOrcamento.length) {
        const venda = await this.recebimentoEquipamentoModel.db.model<Venda>(Venda.name).exists({
          empresaId: user?.empresaId,
          $or: [
            { origemTipo: 'ordem_servico', origemId: { $in: idsOrdemServico } },
            { origemTipo: 'orcamento', origemId: { $in: idsOrcamento } },
          ],
        }).exec();
        if (venda) throw new ConflictException('Ha uma venda vinculada a este atendimento. Regularize o financeiro antes de registrar a devolucao sem reparo.');
      }
      if (origem.resultadoAtendimento === RESULTADO_ATENDIMENTO.SEM_REPARO) {
        throw new ConflictException('Este atendimento foi encerrado sem reparo por outra operacao. Atualize os dados.');
      }

      const actorId = user?.id || user?._id || user?.sub;
      const now = new Date();
      const updated = await this.recebimentoEquipamentoModel.findOneAndUpdate(
        { ...query, resultadoAtendimento: { $exists: false } },
        {
          $set: {
            resultadoAtendimento: RESULTADO_ATENDIMENTO.SEM_REPARO,
            motivoSemReparo: motivo,
            encerradoSemReparoEm: now,
            encerradoSemReparoPor: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
            statusDevolucao: STATUS_DEVOLUCAO.PENDENTE,
          },
        },
        { new: true },
      ).exec();
      if (!updated) throw new ConflictException('O atendimento mudou durante o encerramento. Atualize os dados e tente novamente.');

      await this.registrarAuditoriaRecebimento(updated, user, AUDITORIA_EVENTOS.RECEBIMENTO_SEM_REPARO, {
        operacao: 'encerrado_sem_reparo',
        motivo,
        statusDevolucao: STATUS_DEVOLUCAO.PENDENTE,
      });
      return updated;
    });
  }

  async registrarDevolucao(id: string, dto: RegistrarDevolucaoDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    return executarTransacaoFinanceira(this.recebimentoEquipamentoModel.db, async () => {
      const query = this.getEmpresaQuery(user?.empresaId, { _id: id });
      await bloquearOrigem(this.recebimentoEquipamentoModel.db, 'RecebimentoEquipamento', id, user?.empresaId);
      const recebimento = await this.recebimentoEquipamentoModel.findOne(query).select('+devolucaoAssinaturaImagemBase64').exec();
      if (!recebimento) throw new NotFoundException('Recebimento nao encontrado.');
      const devolvidoParaNome = dto.devolvidoParaNome.trim();
      if (devolvidoParaNome.length < 2) throw new BadRequestException('Informe o nome de quem recebeu o equipamento.');
      if (dto.devolvidoParaTipo === 'terceiro_autorizado' && dto.autorizacaoTerceiroConfirmada !== true) {
        throw new BadRequestException('Confirme que o cliente autorizou a retirada pelo terceiro antes de registrar a devolucao.');
      }
      if (dto.devolvidoParaTipo === 'cliente' && dto.autorizacaoTerceiroConfirmada) {
        throw new BadRequestException('A confirmacao de terceiro autorizado so deve ser marcada quando outra pessoa retirar o equipamento.');
      }
      const assinaturaHash = createHash('sha256').update(dto.assinaturaImagemBase64, 'utf8').digest('hex');
      const observacoes = dto.observacoes?.trim() || undefined;

      if (recebimento.statusDevolucao === STATUS_DEVOLUCAO.DEVOLVIDO) {
        if (recebimento.devolvidoParaNome === devolvidoParaNome && recebimento.devolucaoParaTipo === dto.devolvidoParaTipo
          && recebimento.devolucaoAssinaturaHashSha256 === assinaturaHash && (recebimento.observacoesDevolucao || undefined) === observacoes) return recebimento;
        throw new ConflictException('A devolucao ja foi registrada. Solicite a correcao por uma pessoa responsavel.');
      }
      if (recebimento.resultadoAtendimento !== RESULTADO_ATENDIMENTO.SEM_REPARO || recebimento.statusDevolucao !== STATUS_DEVOLUCAO.PENDENTE) {
        throw new BadRequestException('Registre primeiro o encerramento sem reparo para preparar a devolucao.');
      }

      const actorId = user?.id || user?._id || user?.sub;
      const now = new Date();
      const updated = await this.recebimentoEquipamentoModel.findOneAndUpdate(
        { ...query, resultadoAtendimento: RESULTADO_ATENDIMENTO.SEM_REPARO, statusDevolucao: STATUS_DEVOLUCAO.PENDENTE },
        {
          $set: {
            statusDevolucao: STATUS_DEVOLUCAO.DEVOLVIDO,
            devolucaoEm: now,
            devolvidoParaNome,
            devolucaoParaTipo: dto.devolvidoParaTipo,
            devolucaoAutorizacaoTerceiroConfirmada: dto.devolvidoParaTipo === 'terceiro_autorizado',
            devolucaoAutorizadoPorClienteId: dto.devolvidoParaTipo === 'terceiro_autorizado' ? recebimento.clienteId : undefined,
            devolucaoAutorizacaoRegistradaEm: dto.devolvidoParaTipo === 'terceiro_autorizado' ? now : undefined,
            devolucaoAssinaturaImagemBase64: dto.assinaturaImagemBase64,
            devolucaoAssinaturaHashSha256: assinaturaHash,
            devolucaoIpAssinatura: dto.ipAssinatura,
            devolucaoUserAgentAssinatura: dto.userAgentAssinatura,
            observacoesDevolucao: observacoes,
            devolucaoRegistradaPor: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
          },
        },
        { new: true },
      ).select('+devolucaoAssinaturaImagemBase64').exec();
      if (!updated) throw new ConflictException('A devolucao mudou durante o registro. Atualize os dados e tente novamente.');

      await this.registrarAuditoriaRecebimento(updated, user, AUDITORIA_EVENTOS.RECEBIMENTO_DEVOLUCAO_REGISTRADA, {
        operacao: 'devolucao_registrada',
        devolvidoParaNome,
        devolvidoParaTipo: dto.devolvidoParaTipo,
        autorizacaoTerceiroConfirmada: dto.devolvidoParaTipo === 'terceiro_autorizado',
        assinaturaHashSha256: assinaturaHash,
        dataDevolucao: now.toISOString(),
      });
      return updated;
    });
  }

  async remove(id: string, user?: CurrentUserPayload) {
    const empresaId = user?.empresaId;
    this.assertEmpresaInformada(empresaId);
    return executarTransacaoFinanceira(this.recebimentoEquipamentoModel.db, async () => {
      const query = this.getEmpresaQuery(empresaId, { _id: id });
      const current = await this.recebimentoEquipamentoModel.findOne(query).exec();
      if (!current) return null;

      const [ordemServico, orcamento, condicao, componente, midia, termo] = await Promise.all([
        this.ordemServicoModel.exists({ empresaId, recebimentoEquipamentoId: id }).exec(),
        this.orcamentoModel.exists({ empresaId, recebimentoEquipamentoId: id }).exec(),
        this.condicoesEquipamentoModel.exists({ recebimentoEquipamentoId: id }).exec(),
        this.componentesAusentesModel.exists({ recebimentoEquipamentoId: id }).exec(),
        this.midiasRecebimentoModel.exists({ recebimentoEquipamentoId: id }).exec(),
        this.termosRecebimentoModel.exists({ recebimentoEquipamentoId: id }).exec(),
      ]);
      if (ordemServico || orcamento || condicao || componente || midia || termo) {
        throw new ConflictException('Este recebimento tem OS, orçamento ou documentos vinculados e não pode ser removido. Preserve o histórico e solicite a correção por um responsável.');
      }
      if (current.resultadoAtendimento || current.statusDevolucao) {
        throw new ConflictException('Este atendimento tem resultado ou devolucao registrada e nao pode ser removido. Preserve o historico.');
      }

      const removed = await this.recebimentoEquipamentoModel.findOneAndDelete(query).exec();
      if (!removed) throw new ConflictException('O recebimento mudou durante a remoção. Atualize a tela e tente novamente.');
      await this.registrarAuditoriaRecebimento(removed, user, AUDITORIA_EVENTOS.RECEBIMENTO_REMOVIDO, {
        operacao: 'removido',
        status: removed.status,
      });
      return removed;
    });
  }

  private async registrarAuditoriaRecebimento(
    recebimento: RecebimentoEquipamentoDocument,
    user: CurrentUserPayload | undefined,
    tipoEvento: AuditoriaEvento,
    dados: Record<string, unknown>,
  ) {
    const usuarioId = user?.id || user?._id || user?.sub || recebimento.recebidoPor?.toString();
    if (!usuarioId) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: recebimento.empresaId,
      usuarioId,
      tipoEvento,
      entidade: AUDITORIA_ENTIDADES.RECEBIMENTO,
      entidadeId: String(recebimento._id),
      dados: {
        ...dados,
        clienteId: recebimento.clienteId?.toString(),
      },
    });
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    this.assertEmpresaInformada(empresaId);
    return { ...base, empresaId: new Types.ObjectId(empresaId) };
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
