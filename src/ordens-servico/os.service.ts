import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

  async create(createOrdemServicoDto: CreateOrdemServicoDto, empresaId?: string) {
    const scopedEmpresaId = this.getEmpresaIdPermitida(createOrdemServicoDto.empresaId, empresaId);
    if (!isOsStatus(createOrdemServicoDto.statusOperacional)) {
      throw new BadRequestException(`Status de OS invalido: ${createOrdemServicoDto.statusOperacional}`);
    }

    if (createOrdemServicoDto.orcamentoId) {
      const existente = await this.findByOrcamento(createOrdemServicoDto.orcamentoId, scopedEmpresaId);
      if (existente) {
        return existente;
      }
    }

    const createdOrdemServico = new this.ordemServicoModel({
      ...createOrdemServicoDto,
      empresaId: scopedEmpresaId,
    });
    const saved = await createdOrdemServico.save();

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: scopedEmpresaId,
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

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.ordemServicoModel
      .find({ empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.ordemServicoModel
      .findOne({ _id: id, empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  findByOrcamento(orcamentoId: string, empresaId?: string) {
    const query = empresaId ? { orcamentoId, empresaId } : { orcamentoId };
    return this.ordemServicoModel
      .findOne(query)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  async update(id: string, updateOrdemServicoDto: UpdateOrdemServicoDto, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId }).exec();
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

    const updated = await this.ordemServicoModel
      .findOneAndUpdate({ _id: id, empresaId }, { ...updateOrdemServicoDto, empresaId, dataConclusao: nextStatus === OS_STATUS.CONCLUIDA && ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA ? new Date() : ordemServico.dataConclusao }, { new: true })
      .exec();

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

  async remove(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    assertCanEditOs(ordemServico.statusOperacional);
    return this.ordemServicoModel.findOneAndUpdate({ _id: id, empresaId }, { statusOperacional: OS_STATUS.CANCELADA }, { new: true }).exec();
  }

  async registrarEntrega(id: string, dto: RegistrarEntregaOsDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: id, empresaId: user?.empresaId }).exec();
    if (!ordemServico) {
      throw new NotFoundException('Ordem de servico nao encontrada.');
    }

    if (ordemServico.statusOperacional !== OS_STATUS.CONCLUIDA) {
      throw new BadRequestException('A assinatura de entrega so pode ser registrada em OS concluida.');
    }

    const venda = await this.vendaModel
      .findOne({ origemTipo: 'ordem_servico', origemId: new Types.ObjectId(id), empresaId: user?.empresaId })
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

    const updated = await this.ordemServicoModel.findOneAndUpdate(
      { _id: id, empresaId: user?.empresaId },
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

  async createItem(
    createItensUtilizadosOSDto: CreateItensUtilizadosOSDto,
    options: { skipSaldoCheck?: boolean } = {},
    empresaId?: string,
  ) {
    const ordemServico = await this.assertOsCanConsumeItem(createItensUtilizadosOSDto.ordemServicoId, empresaId);
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

  async reservarPeca(createPecaReservadaOSDto: CreatePecaReservadaOSDto, empresaId?: string) {
    const ordemServico = await this.assertOsCanReserveItem(createPecaReservadaOSDto.ordemServicoId, empresaId);
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
      .populate('ordemServicoId', 'statusOperacional prioridade dataEntrada clienteId')
      .exec();
  }

  async consumirReserva(reservaId: string, empresaId?: string) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanConsumeItem(reserva.ordemServicoId.toString(), empresaId);
    const reservaConsumida = await this.pecasReservadasOSModel.findOneAndDelete({ _id: reservaId }).exec();
    if (!reservaConsumida) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reservaConsumida.produtoId.toString(),
      quantidade: reservaConsumida.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
    });

    const item = await this.createItem(
      {
        ordemServicoId: reservaConsumida.ordemServicoId.toString(),
        produtoId: reservaConsumida.produtoId.toString(),
        quantidade: reservaConsumida.quantidade,
      },
      { skipSaldoCheck: true },
      ordemServico.empresaId.toString(),
    );

    return item;
  }

  async removerReserva(reservaId: string, empresaId?: string) {
    const reserva = await this.pecasReservadasOSModel.findById(reservaId).exec();
    if (!reserva) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    const ordemServico = await this.assertOsCanReserveItem(reserva.ordemServicoId.toString(), empresaId);
    const reservaRemovida = await this.pecasReservadasOSModel.findOneAndDelete({ _id: reservaId }).exec();
    if (!reservaRemovida) {
      throw new NotFoundException('Reserva de peca da OS nao encontrada.');
    }

    await this.registrarMovimentoEstoqueOs({
      ordemServico,
      produtoId: reservaRemovida.produtoId.toString(),
      quantidade: reservaRemovida.quantidade,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA,
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

  async updateItem(id: string, updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto, empresaId?: string) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString(), empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: item.ordemServicoId, empresaId }).exec();
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

  async removeItem(id: string, empresaId?: string) {
    const item = await this.itensUtilizadosOSModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item utilizado na OS nao encontrado.');
    }

    await this.assertOsCanConsumeItem(item.ordemServicoId.toString(), empresaId);
    const ordemServico = await this.ordemServicoModel.findOne({ _id: item.ordemServicoId, empresaId }).exec();

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

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
