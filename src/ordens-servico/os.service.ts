import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { OrdemServico, OrdemServicoDocument } from './schemas/ordem-servico.schema';
import { ItensUtilizadosOS, ItensUtilizadosOSDocument } from './schemas/itens-utilizados-os.schema';
import { PecasReservadasOS, PecasReservadasOSDocument } from './schemas/pecas-reservadas-os.schema';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { RegistrarEntregaOsDto } from './dto/registrar-entrega-os.dto';
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
import { VENDA_STATUS_FINANCEIRO } from '../financeiro/vendas/venda-financeiro.states';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

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

  async create(createOrdemServicoDto: CreateOrdemServicoDto) {
    if (!isOsStatus(createOrdemServicoDto.statusOperacional)) {
      throw new BadRequestException(`Status de OS invalido: ${createOrdemServicoDto.statusOperacional}`);
    }

    if (createOrdemServicoDto.orcamentoId) {
      const existente = await this.findByOrcamento(createOrdemServicoDto.orcamentoId);
      if (existente) {
        return existente;
      }
    }

    const createdOrdemServico = new this.ordemServicoModel(createOrdemServicoDto);
    const saved = await createdOrdemServico.save();

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: createOrdemServicoDto.empresaId,
      usuarioId: createOrdemServicoDto.tecnicoId,
      tipoEvento: AUDITORIA_EVENTOS.OS_CRIADA,
      entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
      entidadeId: saved._id as Types.ObjectId,
      dados: {
        status: createOrdemServicoDto.statusOperacional,
        clienteId: createOrdemServicoDto.clienteId,
        orcamentoId: createOrdemServicoDto.orcamentoId,
      },
    });

    return saved;
  }

  findAll() {
    return this.ordemServicoModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  findOne(id: string) {
    return this.ordemServicoModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  findByOrcamento(orcamentoId: string) {
    return this.ordemServicoModel
      .findOne({ orcamentoId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  async update(id: string, updateOrdemServicoDto: UpdateOrdemServicoDto) {
    const ordemServico = await this.ordemServicoModel.findById(id).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    const nextStatus = updateOrdemServicoDto.statusOperacional;
    const hasNonStatusChanges = Object.keys(updateOrdemServicoDto).some((key) => key !== 'statusOperacional');

    if (nextStatus) {
      assertCanTransitionOs(ordemServico.statusOperacional, nextStatus);
    }

    if (hasNonStatusChanges) {
      assertCanEditOs(ordemServico.statusOperacional);
    }

    const updated = await this.ordemServicoModel.findByIdAndUpdate(id, updateOrdemServicoDto, { new: true }).exec();

    if (nextStatus && nextStatus !== ordemServico.statusOperacional) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordemServico.empresaId,
        usuarioId: ordemServico.tecnicoId,
        tipoEvento: AUDITORIA_EVENTOS.OS_STATUS_ALTERADO,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordemServico._id as Types.ObjectId,
        dados: {
          statusAnterior: ordemServico.statusOperacional,
          statusAtual: nextStatus,
        },
      });
    }

    return updated;
  }

  async remove(id: string) {
    const ordemServico = await this.ordemServicoModel.findById(id).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    assertCanEditOs(ordemServico.statusOperacional);
    return this.ordemServicoModel.findByIdAndDelete(id).exec();
  }

  async registrarEntrega(id: string, dto: RegistrarEntregaOsDto, user?: CurrentUserPayload) {
    const ordemServico = await this.ordemServicoModel.findById(id).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    if (ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA) {
      throw new BadRequestException('A assinatura de entrega so pode ser registrada em OS concluida.');
    }

    const venda = await this.vendaModel
      .findOne({ origemTipo: 'ordem_servico', origemId: new Types.ObjectId(id) })
      .exec();

    if (!venda) {
      throw new BadRequestException('Gere a venda vinculada a esta OS antes de registrar a entrega.');
    }

    if (venda.statusFinanceiro !== VENDA_STATUS_FINANCEIRO.PAGO) {
      throw new BadRequestException('Registre o pagamento total da venda antes de entregar o equipamento.');
    }

    const assinaturaEntregaHashSha256 = createHash('sha256')
      .update(dto.assinaturaImagemBase64, 'utf8')
      .digest('hex');

    const updated = await this.ordemServicoModel.findByIdAndUpdate(
      id,
      {
        dataEntrega: new Date(),
        entregueParaNome: dto.entregueParaNome,
        entregueParaDocumento: dto.entregueParaDocumento,
        assinaturaEntregaImagemBase64: dto.assinaturaImagemBase64,
        assinaturaEntregaHashSha256,
        ipAssinaturaEntrega: dto.ipAssinaturaEntrega,
        userAgentAssinaturaEntrega: dto.userAgentAssinaturaEntrega,
        observacoesEntrega: dto.observacoesEntrega,
      },
      { new: true },
    ).exec();

    const usuarioId = user?.id || user?._id || user?.sub || ordemServico.tecnicoId?.toString();
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: ordemServico.empresaId,
      usuarioId,
      tipoEvento: AUDITORIA_EVENTOS.OS_ENTREGA_ASSINADA,
      entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
      entidadeId: ordemServico._id as Types.ObjectId,
      dados: {
        clienteId: ordemServico.clienteId?.toString(),
        entregueParaNome: dto.entregueParaNome,
        entregueParaDocumento: dto.entregueParaDocumento,
        dataEntrega: new Date().toISOString(),
        assinaturaEntregaHashSha256,
      },
    });

    return updated;
  }

  async createItem(createItensUtilizadosOSDto: CreateItensUtilizadosOSDto, options: { skipSaldoCheck?: boolean } = {}) {
    await this.assertOsCanConsumeItem(createItensUtilizadosOSDto.ordemServicoId);
    if (!options.skipSaldoCheck) {
      await this.estoqueService.assertSaldoDisponivel(
        createItensUtilizadosOSDto.produtoId,
        createItensUtilizadosOSDto.quantidade,
      );
    }

    const createdItem = new this.itensUtilizadosOSModel(createItensUtilizadosOSDto);
    const saved = await createdItem.save();
    const ordemServico = await this.ordemServicoModel.findById(createItensUtilizadosOSDto.ordemServicoId).exec();

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: createItensUtilizadosOSDto.produtoId,
        quantidade: createItensUtilizadosOSDto.quantidade,
        tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS,
      });

      await this.auditoriaService.registrarEventoNegocio({
        empresaId: ordemServico.empresaId,
        usuarioId: ordemServico.tecnicoId,
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

  async reservarPeca(createPecaReservadaOSDto: CreatePecaReservadaOSDto) {
    const ordemServico = await this.assertOsCanReserveItem(createPecaReservadaOSDto.ordemServicoId);
    await this.estoqueService.assertSaldoDisponivel(
      createPecaReservadaOSDto.produtoId,
      createPecaReservadaOSDto.quantidade,
    );
    const createdReserva = new this.pecasReservadasOSModel(createPecaReservadaOSDto);
    const saved = await createdReserva.save();

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: createPecaReservadaOSDto.produtoId,
      quantidade: createPecaReservadaOSDto.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS,
    });

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: ordemServico.empresaId,
      usuarioId: ordemServico.tecnicoId,
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

  findReservasByOs(ordemServicoId: string) {
    return this.pecasReservadasOSModel
      .find({ ordemServicoId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findReservasPendentes() {
    return this.pecasReservadasOSModel
      .find()
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('ordemServicoId', 'statusOperacional prioridade dataEntrada clienteId')
      .exec();
  }

  async consumirReserva(reservaId: string) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanConsumeItem(reserva.ordemServicoId.toString());

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reserva.produtoId.toString(),
      quantidade: reserva.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
    });

    const item = await this.createItem(
      {
        ordemServicoId: reserva.ordemServicoId.toString(),
        produtoId: reserva.produtoId.toString(),
        quantidade: reserva.quantidade,
      },
      { skipSaldoCheck: true },
    );

    await this.pecasReservadasOSModel.findByIdAndDelete(reservaId).exec();
    return item;
  }

  async removerReserva(reservaId: string) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanReserveItem(reserva.ordemServicoId.toString());

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reserva.produtoId.toString(),
      quantidade: reserva.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
    });

    return this.pecasReservadasOSModel.findByIdAndDelete(reservaId).exec();
  }

  findAllItems() {
    return this.itensUtilizadosOSModel.find().exec();
  }

  findItemsByOs(ordemServicoId: string) {
    return this.itensUtilizadosOSModel
      .find({ ordemServicoId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findOneItem(id: string) {
    return this.itensUtilizadosOSModel.findById(id).exec();
  }

  async updateItem(id: string, updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString());
    const ordemServico = await this.ordemServicoModel.findById(item.ordemServicoId).exec();
    const produtoAnteriorId = item.produtoId.toString();
    const quantidadeAnterior = item.quantidade;
    const produtoAtualId = updateItensUtilizadosOSDto.produtoId ?? produtoAnteriorId;
    const quantidadeAtual = updateItensUtilizadosOSDto.quantidade ?? quantidadeAnterior;
    const saldoAdicional = produtoAtualId === produtoAnteriorId ? quantidadeAnterior : 0;

    await this.estoqueService.assertSaldoDisponivel(produtoAtualId, quantidadeAtual, saldoAdicional);

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: produtoAnteriorId,
        quantidade: quantidadeAnterior,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS,
      });
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: produtoAtualId,
        quantidade: quantidadeAtual,
        tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS,
      });
    }

    return this.itensUtilizadosOSModel.findByIdAndUpdate(id, updateItensUtilizadosOSDto, { new: true }).exec();
  }

  async removeItem(id: string) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString());
    const ordemServico = await this.ordemServicoModel.findById(item.ordemServicoId).exec();

    if (ordemServico) {
      await this.registrarMovimentoEstoqueOs({
        ordemServico,
        produtoId: item.produtoId.toString(),
        quantidade: item.quantidade,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS,
      });
    }

    return this.itensUtilizadosOSModel.findByIdAndDelete(id).exec();
  }

  private async assertOsCanConsumeItem(ordemServicoId: string) {
    const ordemServico = await this.ordemServicoModel.findById(ordemServicoId).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    if (ordemServico.statusOperacional !== OS_STATUS.EM_EXECUCAO) {
      throw new BadRequestException('Pecas so podem ser consumidas em OS em execucao.');
    }

    return ordemServico;
  }

  private async assertOsCanReserveItem(ordemServicoId: string) {
    const ordemServico = await this.ordemServicoModel.findById(ordemServicoId).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

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
  }: {
    ordemServico: OrdemServicoDocument;
    produtoId: string;
    quantidade: number;
    tipo: string;
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
      ordemServico.tecnicoId.toString(),
    );
  }
}
