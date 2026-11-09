import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrcamentoCompletoDto } from './dto/create-orcamento-completo.dto';
import { UpdateOrcamentoCompletoDto } from './dto/update-orcamento-completo.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Orcamento, OrcamentoDocument } from './schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from './schemas/itens-orcamento.schema';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';
import { assertCanEditOrcamento, assertCanTransitionOrcamento } from './state/orcamento.transitions';
import { ORCAMENTO_STATUS, isOrcamentoStatus } from './state/orcamento.states';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { OsService } from '../ordens-servico/os.service';
import { OS_STATUS } from '../ordens-servico/state/os.states';
import { centavosParaDecimal128, dinheiroParaCentavos } from '../financeiro/financeiro-adm/financeiro-adm.types';
import { assertTenantReference } from '../common/tenant-reference';
import { bloquearOrigem } from '../common/bloquear-origem';
import { executarTransacaoFinanceira } from '../financeiro/vendas/venda-pagamentos-validos';
import { gerarProtocoloOperacional } from '../common/protocolo-operacional';
import { buscaLiteralRegex, lerConsultaListaOperacional, respostaListaOperacional } from '../common/paginacao-operacional';

@Injectable()
export class OrcamentosService {
  constructor(
    @InjectModel(Orcamento.name) private orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private itensOrcamentoModel: Model<ItensOrcamentoDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly osService: OsService,
  ) {}

  async create(createOrcamentoDto: CreateOrcamentoDto, user?: CurrentUserPayload) {
    return executarTransacaoFinanceira(this.orcamentoModel.db, async () => {
      const empresaId = this.getEmpresaIdPermitida(createOrcamentoDto.empresaId, user?.empresaId);
      const usuarioId = user?.id || user?._id || user?.sub || createOrcamentoDto.criadoPor;
      if (!isOrcamentoStatus(createOrcamentoDto.status)) {
        throw new BadRequestException(`Status de orcamento invalido: ${createOrcamentoDto.status}`);
      }

      const recebimento = await bloquearOrigem(this.orcamentoModel.db, 'RecebimentoEquipamento', createOrcamentoDto.recebimentoEquipamentoId, empresaId);
      if (recebimento.resultadoAtendimento === 'sem_reparo') {
        throw new BadRequestException('Este atendimento foi encerrado sem reparo e nao pode receber um novo orcamento.');
      }
      await this.assertReferenciasDaEmpresa({ ...createOrcamentoDto, criadoPor: usuarioId }, empresaId);

      const totais = this.calcularTotaisOrcamento((createOrcamentoDto as { itens?: any[] }).itens, createOrcamentoDto);
      const numero = await gerarProtocoloOperacional(this.orcamentoModel.db, empresaId, 'ORC');
      const orcamentoData: Record<string, unknown> = {
        ...createOrcamentoDto,
        empresaId,
        criadoPor: usuarioId,
        numero,
        subtotal: centavosParaDecimal128(totais.subtotalCentavos),
        descontos: centavosParaDecimal128(totais.descontosCentavos),
        total: centavosParaDecimal128(totais.totalCentavos),
      };
      const createdOrcamento = new this.orcamentoModel(orcamentoData);
      const saved = await createdOrcamento.save();

      await this.auditoriaService.registrarEventoNegocio({
        empresaId,
        usuarioId,
        tipoEvento: AUDITORIA_EVENTOS.ORCAMENTO_CRIADO,
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: saved._id as Types.ObjectId,
        dados: {
          numero,
          status: createOrcamentoDto.status,
          clienteId: createOrcamentoDto.clienteId,
          total: totais.totalCentavos / 100,
        },
      });

      return saved;
    });
  }

  async createCompleto(input: CreateOrcamentoCompletoDto, user?: CurrentUserPayload) {
    const empresaId = user?.empresaId;
    const usuarioId = user?.id || user?._id || user?.sub;
    if (!Types.ObjectId.isValid(String(empresaId)) || !Types.ObjectId.isValid(String(usuarioId))) throw new UnauthorizedException('Sessão inválida para salvar o orçamento.');
    const dto = plainToInstance(CreateOrcamentoCompletoDto, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })).length) throw new BadRequestException('Confira os dados e itens do orçamento.');
    const totais = this.calcularTotaisOrcamento(dto.itens, { descontos: dto.descontos });
    if (![totais.subtotalCentavos, totais.descontosCentavos, totais.totalCentavos].every(Number.isSafeInteger)) throw new BadRequestException('Valores acima do limite permitido.');
    const itens = dto.itens.map((item) => ({ tipo: item.tipo, referenciaId: item.referenciaId, quantidade: item.quantidade,
      valorUnitario: centavosParaDecimal128(this.parseValorCentavos(item.valorUnitario, 'valorUnitario')),
      totalItem: centavosParaDecimal128(this.calcularTotalItemCentavos(item)) }));
    const operacaoHash = createHash('sha256').update(JSON.stringify({ clienteId: dto.clienteId, recebimentoEquipamentoId: dto.recebimentoEquipamentoId,
      validade: new Date(dto.validade).toISOString(), descontos: totais.descontosCentavos, observacoes: dto.observacoes || '', itens })).digest('hex');
    const scope = { empresaId, criadoPor: usuarioId, operacaoId: dto.operacaoId };
    const replay = async () => {
      const saved = await this.orcamentoModel.findOne(scope).select('+operacaoHash').exec();
      if (!saved) return null;
      if (saved.operacaoHash !== operacaoHash) throw new ConflictException('Esta tentativa já salvou outro conteúdo. Abra o orçamento salvo antes de continuar.');
      return this.findOne(String(saved._id), empresaId);
    };
    const existing = await replay();
    if (existing) return existing;
    let savedId = '';
    try {
      await this.orcamentoModel.db.transaction(async () => {
        await this.assertReferenciasDaEmpresa({ clienteId: dto.clienteId, recebimentoEquipamentoId: dto.recebimentoEquipamentoId, criadoPor: usuarioId }, empresaId!);
        const receipt = await this.orcamentoModel.db.model('RecebimentoEquipamento').findOne({ _id: dto.recebimentoEquipamentoId, empresaId }).select('clienteId estadoSalvamento').lean().exec() as { clienteId?: unknown; estadoSalvamento?: string } | null;
        if (!receipt || String(receipt.clienteId) !== dto.clienteId) throw new BadRequestException('O equipamento selecionado não pertence ao cliente informado.');
        if (receipt.estadoSalvamento === 'pendente_midias') throw new BadRequestException('Conclua os anexos da entrada antes de preparar o orçamento.');
        for (const item of itens) await this.assertReferenciaItemDaEmpresa(item.tipo, item.referenciaId, empresaId!);
        const saved = await this.create({ empresaId: empresaId!, criadoPor: usuarioId!, clienteId: dto.clienteId, recebimentoEquipamentoId: dto.recebimentoEquipamentoId,
          status: ORCAMENTO_STATUS.RASCUNHO, validade: dto.validade, observacoes: dto.observacoes,
          subtotal: (totais.subtotalCentavos / 100).toFixed(2), descontos: (totais.descontosCentavos / 100).toFixed(2), total: (totais.totalCentavos / 100).toFixed(2) }, user);
        savedId = String(saved._id);
        await this.orcamentoModel.updateOne({ _id: saved._id }, { $set: { operacaoId: dto.operacaoId, operacaoHash } }).exec();
        await this.itensOrcamentoModel.insertMany(itens.map((item) => ({ ...item, orcamentoId: saved._id })));
      });
    } catch (error) {
      const winner = await replay();
      if (winner) return winner;
      throw error;
    }
    return this.findOne(savedId, empresaId);
  }

  async updateCompleto(id: string, input: UpdateOrcamentoCompletoDto, user?: CurrentUserPayload) {
    const empresaId = user?.empresaId || '';
    const usuarioId = user?.id || user?._id || user?.sub || '';
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(String(empresaId)) || !Types.ObjectId.isValid(String(usuarioId))) {
      throw new UnauthorizedException('Sessão ou orçamento inválido para atualizar a proposta.');
    }
    const dto = plainToInstance(UpdateOrcamentoCompletoDto, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })).length) {
      throw new BadRequestException('Confira os dados e itens do orçamento.');
    }

    const totais = this.calcularTotaisOrcamento(dto.itens, { descontos: dto.descontos });
    const itemTotals = dto.itens.map((item) => this.calcularTotalItemCentavos(item));
    if (![...itemTotals, totais.subtotalCentavos, totais.descontosCentavos, totais.totalCentavos].every(Number.isSafeInteger)) {
      throw new BadRequestException('Valores acima do limite permitido.');
    }
    const items = dto.itens.map((item, index) => ({
      tipo: item.tipo,
      referenciaId: new Types.ObjectId(item.referenciaId),
      quantidade: item.quantidade,
      valorUnitario: centavosParaDecimal128(this.parseValorCentavos(item.valorUnitario, 'valorUnitario')),
      totalItem: centavosParaDecimal128(itemTotals[index]),
    }));

    return this.inTransaction(async () => {
      const current = await this.orcamentoModel.findOne({ _id: id, empresaId }).exec();
      if (!current) throw new NotFoundException('Orçamento não encontrado.');
      assertCanEditOrcamento(current.status);
      const currentRevision = Number(current.get('__v') ?? 0);
      if (currentRevision !== dto.revisaoEsperada) {
        throw new ConflictException('Este orçamento foi alterado por outra pessoa. Recarregue a versão atual antes de salvar.');
      }

      for (const item of items) await this.assertReferenciaItemDaEmpresa(item.tipo, String(item.referenciaId), empresaId);
      const updated = await this.orcamentoModel.findOneAndUpdate(
        { _id: id, empresaId, status: ORCAMENTO_STATUS.RASCUNHO, __v: dto.revisaoEsperada },
        { $set: {
          validade: dto.validade,
          descontos: centavosParaDecimal128(totais.descontosCentavos),
          observacoes: dto.observacoes || '',
          subtotal: centavosParaDecimal128(totais.subtotalCentavos),
          total: centavosParaDecimal128(totais.totalCentavos),
        }, $inc: { __v: 1 } },
        { new: true },
      ).exec();
      if (!updated) throw new ConflictException('Este orçamento foi alterado por outra pessoa. Recarregue a versão atual antes de salvar.');

      await this.itensOrcamentoModel.deleteMany({ orcamentoId: id }).exec();
      await this.itensOrcamentoModel.insertMany(items.map((item) => ({ ...item, orcamentoId: updated._id })));
      await this.auditoriaService.registrarEventoNegocio({
        empresaId,
        usuarioId,
        tipoEvento: AUDITORIA_EVENTOS.ORCAMENTO_ATUALIZADO,
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: updated._id as Types.ObjectId,
        dados: { revisaoAnterior: dto.revisaoEsperada, revisaoAtual: dto.revisaoEsperada + 1, total: totais.totalCentavos / 100 },
      });
      return this.findOne(id, empresaId);
    });
  }

  async porOperacao(operacaoId: string, user?: CurrentUserPayload) {
    const usuarioId = user?.id || user?._id || user?.sub;
    if (!user?.empresaId || !usuarioId) throw new UnauthorizedException('Sessão inválida.');
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(operacaoId)) throw new BadRequestException('Operação inválida.');
    const saved = await this.orcamentoModel.findOne({ empresaId: user.empresaId, criadoPor: usuarioId, operacaoId }).select('_id').exec();
    if (!saved) throw new NotFoundException('Orçamento ainda não salvo nesta operação.');
    return this.findOne(String(saved._id), user.empresaId);
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.orcamentoModel
      .find({ empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate({ path: 'recebimentoEquipamentoId', select: 'tipoEquipamento marca modelo imeiOuSerial resultadoAtendimento motivoSemReparo statusDevolucao', match: { empresaId } })
      .populate({ path: 'criadoPor', select: 'nome email', match: { empresaId } })
      .exec();
  }

  async findAllPaginado(empresaId: string | undefined, query: Record<string, unknown>) {
    this.assertEmpresaInformada(empresaId);
    const consulta = lerConsultaListaOperacional(query);
    const filtro: Record<string, unknown> = { empresaId };
    if (consulta.status) filtro.status = consulta.status;
    if (consulta.busca) {
      const regex = buscaLiteralRegex(consulta.busca);
      const [clientes, recebimentos] = await Promise.all([
        this.orcamentoModel.db.model('Cliente').find({ empresaId, $or: [{ nome: regex }, { cpfCnpj: regex }] }).distinct('_id').exec(),
        this.orcamentoModel.db.model('RecebimentoEquipamento').find({ empresaId, $or: [{ tipoEquipamento: regex }, { marca: regex }, { modelo: regex }, { imeiOuSerial: regex }] }).distinct('_id').exec(),
      ]);
      filtro.$or = [
        { numero: regex },
        ...(clientes.length ? [{ clienteId: { $in: clientes } }] : []),
        ...(recebimentos.length ? [{ recebimentoEquipamentoId: { $in: recebimentos } }] : []),
      ];
    }
    const [itens, total] = await Promise.all([
      this.orcamentoModel.find(filtro).sort({ criadoEm: -1, _id: -1 }).skip((consulta.pagina - 1) * consulta.limite).limit(consulta.limite)
        .populate('empresaId', 'nomeFantasia razaoSocial')
        .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
        .populate({ path: 'recebimentoEquipamentoId', select: 'numero tipoEquipamento marca modelo imeiOuSerial resultadoAtendimento motivoSemReparo statusDevolucao', match: { empresaId } })
        .populate({ path: 'criadoPor', select: 'nome email', match: { empresaId } }).exec(),
      this.orcamentoModel.countDocuments(filtro).exec(),
    ]);
    return respostaListaOperacional(itens, total, consulta);
  }

  findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.orcamentoModel
      .findOne({ _id: id, empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate({ path: 'recebimentoEquipamentoId', select: 'tipoEquipamento marca modelo imeiOuSerial resultadoAtendimento motivoSemReparo statusDevolucao', match: { empresaId } })
      .populate({ path: 'criadoPor', select: 'nome email', match: { empresaId } })
      .exec();
  }

  async update(id: string, updateOrcamentoDto: UpdateOrcamentoDto, empresaId?: string, user?: CurrentUserPayload) {
    return this.inTransaction(() => this.updateAtomic(id, updateOrcamentoDto, empresaId, user));
  }

  private async updateAtomic(id: string, updateOrcamentoDto: UpdateOrcamentoDto, empresaId?: string, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(empresaId);
    const orcamento = await this.orcamentoModel.findOne({ _id: id, empresaId }).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    const nextStatus = updateOrcamentoDto.status;
    const hasNonStatusChanges = Object.keys(updateOrcamentoDto).some((key) => key !== 'status');

    if (nextStatus) {
      assertCanTransitionOrcamento(orcamento.status, nextStatus);
    }

    if (hasNonStatusChanges) {
      assertCanEditOrcamento(orcamento.status);
    }

    await this.assertReferenciasDaEmpresa(updateOrcamentoDto, empresaId);

    const updateData: Record<string, unknown> = { ...updateOrcamentoDto, empresaId };
    delete updateData.subtotal;
    delete updateData.total;
    delete updateData.descontos;

    if (updateOrcamentoDto.descontos !== undefined) {
      const itensAtuais = await this.itensOrcamentoModel.find({ orcamentoId: id }).lean().exec();
      const totais = this.calcularTotaisOrcamento(itensAtuais, {
        descontos: updateOrcamentoDto.descontos,
        subtotal: orcamento.subtotal?.toString(),
        total: orcamento.total?.toString(),
      });
      updateData.subtotal = centavosParaDecimal128(totais.subtotalCentavos);
      updateData.descontos = centavosParaDecimal128(totais.descontosCentavos);
      updateData.total = centavosParaDecimal128(totais.totalCentavos);
    }
    const revision = Number(orcamento.get('__v') ?? 0);
    const updated = await this.orcamentoModel.findOneAndUpdate(
      { _id: id, empresaId, __v: revision },
      { $set: updateData, $inc: { __v: 1 } },
      { new: true },
    ).exec();
    if (!updated) throw new ConflictException('Este orçamento foi alterado por outra pessoa. Recarregue a versão atual antes de salvar.');

    if (nextStatus && nextStatus !== orcamento.status) {
      const actorId = user?.id || user?._id || user?.sub || orcamento.criadoPor;
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: orcamento.empresaId,
        usuarioId: actorId,
        tipoEvento: this.getOrcamentoAuditEvent(nextStatus),
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: orcamento._id as Types.ObjectId,
        dados: {
          statusAnterior: orcamento.status,
          statusAtual: nextStatus,
        },
      });
    }

    return updated;
  }

  async remove(id: string, empresaId?: string, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(empresaId);
    return this.inTransaction(async () => {
      const orcamento = await this.orcamentoModel.findOne({ _id: id, empresaId }).exec();
      if (!orcamento) {
        throw new NotFoundException('Orcamento nao encontrado.');
      }

      assertCanEditOrcamento(orcamento.status);
      const revision = Number(orcamento.get('__v') ?? 0);
      const updated = await this.orcamentoModel.findOneAndUpdate(
        { _id: id, empresaId, __v: revision },
        { $set: { status: ORCAMENTO_STATUS.CANCELADO }, $inc: { __v: 1 } },
        { new: true },
      ).exec();
      if (!updated) throw new ConflictException('Este orçamento foi alterado por outra pessoa. Recarregue a versão atual antes de cancelar.');

      await this.auditoriaService.registrarEventoNegocio({
        empresaId: orcamento.empresaId,
        usuarioId: user?.id || user?._id || user?.sub || orcamento.criadoPor,
        tipoEvento: this.getOrcamentoAuditEvent(ORCAMENTO_STATUS.CANCELADO),
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: orcamento._id as Types.ObjectId,
        dados: { statusAnterior: orcamento.status, statusAtual: ORCAMENTO_STATUS.CANCELADO },
      });
      return updated;
    });
  }

  async gerarOrdemServico(id: string, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Orcamento invalido.');
    }

    const orcamento = await this.orcamentoModel.findOne({ _id: id, empresaId: user.empresaId }).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    if (user?.empresaId && String(orcamento.empresaId) !== user.empresaId) {
      throw new UnauthorizedException('Orcamento nao pertence a empresa do usuario.');
    }

    if (orcamento.status !== ORCAMENTO_STATUS.APROVADO) {
      throw new BadRequestException('Apenas orcamento aprovado pode gerar ordem de servico.');
    }

    const tecnicoId = user?.id || user?._id || user?.sub || String(orcamento.criadoPor);

    return this.osService.create({
      empresaId: String(orcamento.empresaId),
      clienteId: String(orcamento.clienteId),
      tecnicoId,
      orcamentoId: id,
      recebimentoEquipamentoId: String(orcamento.recebimentoEquipamentoId),
      statusOperacional: OS_STATUS.ABERTA,
      prioridade: 'normal',
      dataEntrada: new Date().toISOString(),
    }, user?.empresaId, user);
  }

  async createItem(createItensOrcamentoDto: CreateItensOrcamentoDto, empresaId?: string) {
    return this.inTransaction(() => this.createItemAtomic(createItensOrcamentoDto, empresaId));
  }

  private async createItemAtomic(createItensOrcamentoDto: CreateItensOrcamentoDto, empresaId?: string) {
    const orcamento = await this.assertOrcamentoCanReceiveItem(createItensOrcamentoDto.orcamentoId, empresaId);
    await this.assertReferenciaItemDaEmpresa(createItensOrcamentoDto.tipo, createItensOrcamentoDto.referenciaId, orcamento.empresaId);

    const itemData: Record<string, unknown> = {
      ...createItensOrcamentoDto,
      valorUnitario: centavosParaDecimal128(this.parseValorCentavos(createItensOrcamentoDto.valorUnitario, 'valorUnitario')),
      totalItem: centavosParaDecimal128(this.calcularTotalItemCentavos(createItensOrcamentoDto)),
    };
    const createdItem = new this.itensOrcamentoModel(itemData);
    const saved = await createdItem.save();
    await this.recalcularTotaisOrcamento(createItensOrcamentoDto.orcamentoId);
    return saved;
  }

  async findAllItems(empresaId?: string) {
    const orcamentoIds = await this.getOrcamentoIdsDaEmpresa(empresaId);
    return this.itensOrcamentoModel.find({ orcamentoId: { $in: orcamentoIds } }).exec();
  }

  async findItemsByOrcamento(orcamentoId: string, empresaId?: string) {
    await this.assertOrcamentoDaEmpresa(orcamentoId, empresaId);
    return this.itensOrcamentoModel.find({ orcamentoId }).exec();
  }

  async findOneItem(id: string, empresaId?: string) {
    const item = await this.itensOrcamentoModel.findById(id).exec();
    if (!item) {
      return null;
    }

    await this.assertOrcamentoDaEmpresa(item.orcamentoId.toString(), empresaId);
    return item;
  }

  async updateItem(id: string, updateItensOrcamentoDto: UpdateItensOrcamentoDto, empresaId?: string) {
    return this.inTransaction(() => this.updateItemAtomic(id, updateItensOrcamentoDto, empresaId));
  }

  private async updateItemAtomic(id: string, updateItensOrcamentoDto: UpdateItensOrcamentoDto, empresaId?: string) {
    const item = await this.itensOrcamentoModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de orcamento nao encontrado.');
    }

    const origem = await this.assertOrcamentoCanReceiveItem(item.orcamentoId.toString(), empresaId);
    let destino = origem;
    if (updateItensOrcamentoDto.orcamentoId) {
      destino = await this.assertOrcamentoCanReceiveItem(updateItensOrcamentoDto.orcamentoId, empresaId);
    }
    await this.assertReferenciaItemDaEmpresa(updateItensOrcamentoDto.tipo ?? item.tipo, updateItensOrcamentoDto.referenciaId ?? item.referenciaId, destino.empresaId);

    const updateData: Record<string, unknown> = { ...updateItensOrcamentoDto };
    const quantidade = updateItensOrcamentoDto.quantidade ?? item.quantidade;
    const valorUnitario = updateItensOrcamentoDto.valorUnitario ?? item.valorUnitario?.toString();
    updateData.valorUnitario = centavosParaDecimal128(this.parseValorCentavos(valorUnitario, 'valorUnitario'));
    updateData.totalItem = centavosParaDecimal128(this.calcularTotalItemCentavos({ quantidade, valorUnitario }));

    const updated = await this.itensOrcamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    await this.recalcularTotaisOrcamento(item.orcamentoId.toString());
    if (updateItensOrcamentoDto.orcamentoId && updateItensOrcamentoDto.orcamentoId !== item.orcamentoId.toString()) {
      await this.recalcularTotaisOrcamento(updateItensOrcamentoDto.orcamentoId);
    }
    return updated;
  }

  async removeItem(id: string, empresaId?: string) {
    return this.inTransaction(() => this.removeItemAtomic(id, empresaId));
  }

  private async removeItemAtomic(id: string, empresaId?: string) {
    const item = await this.itensOrcamentoModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de orcamento nao encontrado.');
    }

    const orcamentoId = item.orcamentoId.toString();
    await this.assertOrcamentoCanReceiveItem(orcamentoId, empresaId);
    const removed = await this.itensOrcamentoModel.findByIdAndDelete(id).exec();
    await this.recalcularTotaisOrcamento(orcamentoId);
    return removed;
  }

  private async assertOrcamentoCanReceiveItem(orcamentoId: string, empresaId?: string) {
    const orcamento = await this.assertOrcamentoDaEmpresa(orcamentoId, empresaId);

    assertCanEditOrcamento(orcamento.status);
    return orcamento;
  }

  private async assertReferenciaItemDaEmpresa(tipo: string, referenciaId: unknown, empresaId: unknown) {
    if (tipo === 'produto' || tipo === 'servico') {
      await assertTenantReference(this.orcamentoModel.db, tipo === 'produto' ? 'Produto' : 'Servico', referenciaId, empresaId);
      return;
    }
    throw new BadRequestException('Tipo do item de orcamento invalido.');
  }

  private async assertOrcamentoDaEmpresa(orcamentoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const orcamento = await this.orcamentoModel.findOne({ _id: orcamentoId, empresaId }).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    return orcamento;
  }

  private async getOrcamentoIdsDaEmpresa(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const orcamentos = await this.orcamentoModel.find({ empresaId }).select('_id').lean().exec();
    return orcamentos.map((orcamento) => orcamento._id);
  }

  private async assertReferenciasDaEmpresa(dto: UpdateOrcamentoDto, empresaId: string) {
    for (const [campo, model] of [
      ['clienteId', 'Cliente'],
      ['recebimentoEquipamentoId', 'RecebimentoEquipamento'],
      ['criadoPor', 'Usuario'],
    ] as const) {
      const id = dto[campo];
      if (id !== undefined) {
        await assertTenantReference(this.orcamentoModel.db, model, id, empresaId);
      }
    }
  }

  private getEmpresaIdPermitida(inputEmpresaId: unknown, userEmpresaId?: string) {
    if (userEmpresaId) {
      if (inputEmpresaId && String(inputEmpresaId) !== String(userEmpresaId)) {
        throw new UnauthorizedException('Empresa informada nao pertence ao usuario.');
      }
      return userEmpresaId;
    }

    if (!inputEmpresaId) {
      throw new UnauthorizedException('Empresa do orcamento nao informada.');
    }

    return String(inputEmpresaId);
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }

  private getOrcamentoAuditEvent(status: string) {
    switch (status) {
      case ORCAMENTO_STATUS.ENVIADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_ENVIADO;
      case ORCAMENTO_STATUS.APROVADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_APROVADO;
      case ORCAMENTO_STATUS.REJEITADO:
      case ORCAMENTO_STATUS.REPROVADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_REPROVADO;
      case ORCAMENTO_STATUS.CANCELADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_CANCELADO;
      default:
        return AUDITORIA_EVENTOS.ORCAMENTO_CRIADO;
    }
  }

  private calcularTotaisOrcamento(itens: any[] | undefined, dto: { subtotal?: unknown; descontos?: unknown; total?: unknown }) {
    const subtotalCentavos = Array.isArray(itens) && itens.length > 0
      ? itens.reduce((sum, item) => sum + this.calcularTotalItemCentavos(item), 0)
      : this.parseValorCentavos(dto.subtotal ?? dto.total ?? 0, 'subtotal');
    const descontosCentavos = dto.descontos !== undefined
      ? this.parseValorCentavos(dto.descontos, 'descontos')
      : 0;

    if (subtotalCentavos < 0 || descontosCentavos < 0) {
      throw new BadRequestException('Valores do orcamento nao podem ser negativos.');
    }

    if (descontosCentavos > subtotalCentavos) {
      throw new BadRequestException('Desconto nao pode ser maior que o subtotal do orcamento.');
    }

    return {
      subtotalCentavos,
      descontosCentavos,
      totalCentavos: subtotalCentavos - descontosCentavos,
    };
  }

  private calcularTotalItemCentavos(item: { quantidade?: unknown; valorUnitario?: unknown }) {
    const quantidade = Number(item.quantidade ?? 0);
    const valorUnitarioCentavos = this.parseValorCentavos(item.valorUnitario ?? 0, 'valorUnitario');
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new BadRequestException('Quantidade do item deve ser maior que zero.');
    }

    if (valorUnitarioCentavos < 0) {
      throw new BadRequestException('Valor unitario do item nao pode ser negativo.');
    }

    return Math.round(quantidade * valorUnitarioCentavos);
  }

  private parseValorCentavos(value: unknown, campo: string) {
    const centavos = dinheiroParaCentavos(value);
    if (!Number.isFinite(centavos)) {
      throw new BadRequestException(`${campo} invalido.`);
    }

    return centavos;
  }

  private async recalcularTotaisOrcamento(orcamentoId: string) {
    const orcamento = await this.orcamentoModel.findById(orcamentoId).exec();
    if (!orcamento) {
      return;
    }

    const itens = await this.itensOrcamentoModel.find({ orcamentoId }).lean().exec();
    const totais = this.calcularTotaisOrcamento(itens, {
      descontos: orcamento.descontos?.toString(),
      subtotal: orcamento.subtotal?.toString(),
    });
    const updated = await this.orcamentoModel.findOneAndUpdate({ _id: orcamentoId, __v: orcamento.get('__v') }, {
      $set: {
        subtotal: centavosParaDecimal128(totais.subtotalCentavos),
        descontos: centavosParaDecimal128(totais.descontosCentavos),
        total: centavosParaDecimal128(totais.totalCentavos),
      },
      $inc: { __v: 1 },
    }).exec();
    if (!updated) throw new ConflictException('Este orçamento foi alterado durante a atualização. Recarregue a versão atual.');
  }

  private inTransaction<T>(work: () => Promise<T>) {
    const base = this.orcamentoModel.db.base as unknown as {
      transactionAsyncLocalStorage?: { getStore: () => { session?: unknown } | undefined };
    };
    return base?.transactionAsyncLocalStorage?.getStore()?.session
      ? work()
      : this.orcamentoModel.db.transaction(work);
  }
}
