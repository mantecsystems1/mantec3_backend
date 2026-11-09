import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { bloquearOrigem } from '../../common/bloquear-origem';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { validate } from 'class-validator';
import { Venda, VendaDocument } from './schemas/venda.schema';
import { OperacaoVenda, OperacaoVendaDocument } from './schemas/operacao-venda.schema';
import { ItensVenda, ItensVendaDocument } from './schemas/itens-venda.schema';
import { CreateVendaDto } from './dto/create-venda.dto';
import { CreateVendaCompletaDto } from './dto/create-venda-completa.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { CreateItensVendaDto } from './dto/create-itens-venda.dto';
import { UpdateItensVendaDto } from './dto/update-itens-venda.dto';
import { VENDA_STATUS_FINANCEIRO, calcularStatusFinanceiroVenda, isVendaStatusFinanceiro } from './venda-financeiro.states';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { FinanceiroAdmService } from '../financeiro-adm/financeiro-adm.service';
import { centavosParaDecimal128, dinheiroParaCentavos } from '../financeiro-adm/financeiro-adm.types';
import { assertTenantReference } from '../../common/tenant-reference';
import { executarTransacaoFinanceira, totalPagamentosValidosCentavos } from './venda-pagamentos-validos';

@Injectable()
export class VendasService {
  constructor(
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    @InjectModel(ItensVenda.name) private itensVendaModel: Model<ItensVendaDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly financeiroAdmService: FinanceiroAdmService,
    @InjectModel(OperacaoVenda.name) private readonly operacaoVendaModel: Model<OperacaoVendaDocument>,
  ) {}

  async createCompleto(input: CreateVendaCompletaDto, user?: { empresaId?: string; id?: string; _id?: string; sub?: string }) {
    const empresaId = user?.empresaId || '';
    const operadorId = user?.id || user?._id || user?.sub || '';
    if (!Types.ObjectId.isValid(String(empresaId)) || !Types.ObjectId.isValid(String(operadorId))) {
      throw new UnauthorizedException('Sessão inválida para salvar a venda.');
    }

    const dto = plainToInstance(CreateVendaCompletaDto, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })).length) {
      throw new BadRequestException('Confira os dados e itens da venda.');
    }

    const itens = dto.itens.map((item) => ({
      tipo: item.tipo,
      referenciaId: new Types.ObjectId(item.referenciaId).toString(),
      quantidade: item.quantidade,
      valorUnitario: String(item.valorUnitario),
    }));
    const clienteId = new Types.ObjectId(dto.clienteId).toString();
    const origemId = new Types.ObjectId(dto.origemId).toString();
    const totais = this.calcularTotaisVenda(itens, { descontos: dto.descontos });
    const totalItensSeguros = itens.map((item) => this.calcularTotalItemCentavos(item));
    if (![...totalItensSeguros, totais.subtotalCentavos, totais.descontosCentavos, totais.totalCentavos].every(Number.isSafeInteger)) {
      throw new BadRequestException('Valores acima do limite permitido.');
    }

    const operacaoId = dto.operacaoId.toLowerCase();
    const scope = { empresaId, operacaoId };
    const hashConteudo = createHash('sha256').update(JSON.stringify({
      clienteId,
      origemTipo: dto.origemTipo,
      origemId,
      descontosCentavos: totais.descontosCentavos,
      itens: itens.map((item, index) => ({ tipo: item.tipo, referenciaId: item.referenciaId, quantidade: item.quantidade,
        valorUnitarioCentavos: this.parseValorCentavos(item.valorUnitario, 'valorUnitario'), totalItemCentavos: totalItensSeguros[index] })),
    })).digest('hex');
    const replay = async () => {
      const operation = await this.operacaoVendaModel.findOne(scope).select('+hashConteudo').exec();
      if (!operation) return null;
      if (operation.hashConteudo !== hashConteudo) {
        throw new ConflictException('Esta tentativa já salvou outra venda. Abra a venda salva antes de continuar.');
      }
      const saved = await this.findOne(String(operation.vendaId), empresaId);
      if (!saved) throw new ConflictException('A venda desta tentativa não está disponível. Solicite conferência.');
      return saved;
    };

    const existing = await replay();
    if (existing) return existing;

    const createDto: CreateVendaDto = {
      empresaId,
      clienteId,
      origemTipo: dto.origemTipo,
      origemId,
      subtotal: (totais.subtotalCentavos / 100).toFixed(2),
      descontos: (totais.descontosCentavos / 100).toFixed(2),
      total: (totais.totalCentavos / 100).toFixed(2),
      statusFinanceiro: 'pendente',
      itens,
    };

    try {
      return await this.vendaModel.db.transaction(async () => {
        const concurrent = await replay();
        if (concurrent) return concurrent;
        const saved = await this.createAtomic(createDto, operadorId, empresaId);
        if (!saved?._id) throw new ConflictException('Não foi possível confirmar a venda gerada.');
        await this.operacaoVendaModel.create({ ...scope, operadorId, hashConteudo, vendaId: saved._id });
        return saved;
      });
    } catch (error) {
      const winner = await replay();
      if (winner) return winner;
      throw error;
    }
  }

  async porOperacao(operacaoId: string, user?: { empresaId?: string; id?: string; _id?: string; sub?: string }) {
    const operadorId = user?.id || user?._id || user?.sub;
    if (!user?.empresaId || !operadorId) throw new UnauthorizedException('Sessão inválida.');
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(operacaoId)) {
      throw new BadRequestException('Operação inválida.');
    }
    const operation = await this.operacaoVendaModel.findOne({ empresaId: user.empresaId, operacaoId: operacaoId.toLowerCase() }).select('vendaId').exec();
    if (!operation) throw new NotFoundException('Venda ainda não salva nesta operação.');
    const saved = await this.findOne(String(operation.vendaId), user.empresaId);
    if (!saved) throw new NotFoundException('Venda da operação não encontrada.');
    return saved;
  }

  // Venda CRUD
  async create(createVendaDto: CreateVendaDto, actorId?: string, actorEmpresaId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.createAtomic(createVendaDto, actorId, actorEmpresaId));
  }

  private async createAtomic(createVendaDto: CreateVendaDto, actorId?: string, actorEmpresaId?: string) {
    const { itens = [], ...dto } = createVendaDto;
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    await assertTenantReference(this.vendaModel.db, 'Cliente', dto.clienteId, actorEmpresaId ?? dto.empresaId);

    if (!isVendaStatusFinanceiro(dto.statusFinanceiro)) {
      throw new BadRequestException(`Status financeiro invalido: ${dto.statusFinanceiro}`);
    }
    if ([VENDA_STATUS_FINANCEIRO.PAGO, VENDA_STATUS_FINANCEIRO.PARCIAL].includes(dto.statusFinanceiro as 'pago' | 'parcial')) {
      throw new BadRequestException('A situacao financeira e calculada pelos pagamentos. Crie a venda pendente e registre o pagamento.');
    }

    if (!['venda_direta', 'ordem_servico'].includes(dto.origemTipo)) {
      throw new BadRequestException('Origem da venda invalida. Use venda direta ou ordem de servico.');
    }

    const totais = this.calcularTotaisVenda(itens, dto);
    if (dto.origemTipo === 'ordem_servico') {
      const origem = await bloquearOrigem(this.vendaModel.db, 'OrdemServico', dto.origemId, dto.empresaId);
      if (String(origem.clienteId) !== dto.clienteId) throw new BadRequestException('O cliente da venda deve corresponder ao cliente da OS.');
      const existentes = await this.vendaModel.find({ empresaId: dto.empresaId, origemTipo: 'ordem_servico', origemId: dto.origemId }).limit(2).exec();
      if (existentes.length > 1) throw new ConflictException('Há mais de uma venda para esta OS. Solicite conferência antes de gerar ou receber valores.');
      const existente = existentes[0];
      if (existente) {
        const atuais = await this.itensVendaModel.find({ vendaId: existente._id }).lean().exec();
        const assinatura = (items: { tipo?: unknown; referenciaId?: unknown; quantidade?: unknown; valorUnitario?: unknown }[]) => JSON.stringify(items.map(item => JSON.stringify([String(item.tipo), String(item.referenciaId), Number(item.quantidade), dinheiroParaCentavos(item.valorUnitario)])).sort());
        if (String(existente.clienteId) !== dto.clienteId || existente.statusFinanceiro === 'cancelado' ||
          dinheiroParaCentavos(existente.subtotal) !== totais.subtotalCentavos || dinheiroParaCentavos(existente.descontos) !== totais.descontosCentavos || dinheiroParaCentavos(existente.total) !== totais.totalCentavos || assinatura(atuais) !== assinatura(itens)) {
          throw new ConflictException('Esta OS já possui uma venda com dados diferentes ou cancelada. Abra a venda existente para conferir; outra venda não foi criada.');
        }
        return this.findOne(String(existente._id), actorEmpresaId ?? dto.empresaId);
      }
    }
    const vendaData: any = {
      ...dto,
      subtotal: centavosParaDecimal128(totais.subtotalCentavos),
      descontos: centavosParaDecimal128(totais.descontosCentavos),
      total: centavosParaDecimal128(totais.totalCentavos),
    };
    const createdVenda = new this.vendaModel(vendaData);
    await createdVenda.save();

    if (Array.isArray(itens) && itens.length > 0) {
      for (const item of itens) {
        await this.createItemAtomic({
          vendaId: createdVenda._id.toString(),
          tipo: item.tipo,
          referenciaId: item.referenciaId,
          quantidade: Number(item.quantidade),
          valorUnitario: String(item.valorUnitario),
          totalItem: String(this.calcularTotalItemCentavos(item)),
        }, actorEmpresaId, true);
      }
    }

    if (actorId) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: dto.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.VENDA_GERADA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: createdVenda._id as Types.ObjectId,
        dados: {
          clienteId: dto.clienteId,
          origemTipo: dto.origemTipo,
          origemId: dto.origemId,
          total: totais.totalCentavos / 100,
          statusFinanceiro: dto.statusFinanceiro,
        },
      });
    }

    await this.financeiroAdmService.sincronizarTituloVenda(createdVenda, actorId, actorEmpresaId);

    return this.findOne(createdVenda._id.toString(), actorEmpresaId);
  }

  async findAll(empresaId?: string) {
    const vendas = await this.vendaModel
      .find(this.getEmpresaQuery(empresaId))
      .populate({ path: 'clienteId', select: 'nome cpfCnpj email', match: (venda: any) => ({ empresaId: venda.empresaId }) })
      .lean()
      .exec();
    return Promise.all(vendas.map((venda) => this.attachItensVenda(venda)));
  }

  async findOne(id: string, empresaId?: string) {
    const venda = await this.vendaModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate({ path: 'clienteId', select: 'nome cpfCnpj email', match: (venda: any) => ({ empresaId: venda.empresaId }) })
      .lean()
      .exec();
    return venda ? this.attachItensVenda(venda) : null;
  }

  async update(id: string, updateVendaDto: UpdateVendaDto, actorId?: string, actorEmpresaId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.updateAtomic(id, updateVendaDto, actorId, actorEmpresaId));
  }

  private async updateAtomic(id: string, updateVendaDto: UpdateVendaDto, actorId?: string, actorEmpresaId?: string) {
    const { itens, ...dto } = updateVendaDto;
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const vendaAtual = await this.vendaModel.findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { $inc: { __v: 1 } }, { new: true }).exec();
    if (!vendaAtual) {
      throw new NotFoundException('Venda nao encontrada.');
    }
    await assertTenantReference(this.vendaModel.db, 'Cliente', dto.clienteId ?? vendaAtual.clienteId, vendaAtual.empresaId);
    if (dto.origemTipo !== undefined && !['venda_direta', 'ordem_servico'].includes(dto.origemTipo)) throw new BadRequestException('Origem da venda invalida.');
    const origemTipo = dto.origemTipo ?? vendaAtual.origemTipo;
    const origemId = dto.origemId ?? String(vendaAtual.origemId);
    if (origemTipo === 'ordem_servico' && ['origemTipo', 'origemId', 'clienteId'].some(key => Object.prototype.hasOwnProperty.call(dto, key))) {
      const origem = await bloquearOrigem(this.vendaModel.db, 'OrdemServico', origemId, vendaAtual.empresaId);
      if (String(origem.clienteId) !== String(dto.clienteId ?? vendaAtual.clienteId)) throw new BadRequestException('O cliente da venda deve corresponder ao cliente da OS.');
      if (await this.vendaModel.exists({ empresaId: vendaAtual.empresaId, origemTipo, origemId, _id: { $ne: id } }).exec()) throw new ConflictException('Já existe outra venda para esta OS. Confira os vínculos antes de alterar.');
    }
    if (dto.empresaId && String(dto.empresaId) !== String(vendaAtual.empresaId)) {
      throw new BadRequestException('Venda nao pode ser movida para outra empresa.');
    }

    if (dto.statusFinanceiro === 'cancelado') {
      if (await totalPagamentosValidosCentavos(this.vendaModel.db, id, String(vendaAtual.empresaId)) > 0) {
        throw new BadRequestException('Venda com pagamento deve ser estornada antes de cancelar.');
      }
      await this.financeiroAdmService.cancelarTituloPorOrigem(
        vendaAtual.empresaId.toString(),
        'venda',
        id,
        actorId,
        actorEmpresaId,
      );
    }

    const updateData: any = { ...dto };
    delete updateData.subtotal;
    delete updateData.total;
    delete updateData.descontos;

    if (itens !== undefined) {
      const totais = this.calcularTotaisVenda(itens, { ...dto, descontos: dto.descontos ?? vendaAtual.descontos });
      updateData.subtotal = centavosParaDecimal128(totais.subtotalCentavos);
      updateData.descontos = centavosParaDecimal128(totais.descontosCentavos);
      updateData.total = centavosParaDecimal128(totais.totalCentavos);
    } else if (dto.descontos !== undefined) {
      const itensAtuais = await this.itensVendaModel.find({ vendaId: id }).lean().exec();
      const totais = this.calcularTotaisVenda(itensAtuais, {
        ...dto,
        subtotal: vendaAtual.subtotal?.toString(),
        total: vendaAtual.total?.toString(),
      });
      updateData.subtotal = centavosParaDecimal128(totais.subtotalCentavos);
      updateData.descontos = centavosParaDecimal128(totais.descontosCentavos);
      updateData.total = centavosParaDecimal128(totais.totalCentavos);
    }
    const totalPagoCentavos = await totalPagamentosValidosCentavos(this.vendaModel.db, id, String(vendaAtual.empresaId));
    const novoTotal = updateData.total ?? vendaAtual.total;
    if (dinheiroParaCentavos(novoTotal) < totalPagoCentavos) {
      throw new BadRequestException('O total da venda nao pode ser menor que o valor ja recebido. Estorne o pagamento antes de alterar o total.');
    }
    const statusDerivado = calcularStatusFinanceiroVenda(novoTotal, totalPagoCentavos / 100);
    if (dto.statusFinanceiro !== undefined && dto.statusFinanceiro !== 'cancelado' && dto.statusFinanceiro !== statusDerivado) {
      throw new BadRequestException('A situacao financeira e calculada pelos pagamentos. Registre ou estorne o pagamento para altera-la.');
    }
    updateData.statusFinanceiro = dto.statusFinanceiro === 'cancelado' || vendaAtual.statusFinanceiro === 'cancelado'
      ? 'cancelado' : statusDerivado;
    const updated = await this.vendaModel.findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException('Venda nao encontrada.');
    }

    if (itens !== undefined) {
      await this.itensVendaModel.deleteMany({ vendaId: id });
      if (Array.isArray(itens) && itens.length > 0) {
        for (const item of itens) {
          await this.createItemAtomic({
            vendaId: id,
            tipo: item.tipo,
            referenciaId: item.referenciaId,
            quantidade: Number(item.quantidade),
            valorUnitario: String(item.valorUnitario),
            totalItem: String(this.calcularTotalItemCentavos(item)),
          }, actorEmpresaId, true);
        }
      }
    }

    if (actorId) {
      const venda = await this.vendaModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
      if (venda) {
        await this.auditoriaService.registrarEventoNegocio({
          empresaId: venda.empresaId,
          usuarioId: actorId,
          tipoEvento: AUDITORIA_EVENTOS.VENDA_ATUALIZADA,
          entidade: AUDITORIA_ENTIDADES.VENDA,
          entidadeId: venda._id as Types.ObjectId,
          dados: {
            operacao: 'atualizada',
            statusFinanceiro: venda.statusFinanceiro,
          },
        });
      }
    }

    await this.financeiroAdmService.sincronizarTituloVenda(updated, actorId, actorEmpresaId);

    return this.findOne(id, actorEmpresaId);
  }

  async remove(id: string, actorId?: string, actorEmpresaId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.removeAtomic(id, actorId, actorEmpresaId));
  }

  private async removeAtomic(id: string, actorId?: string, actorEmpresaId?: string) {
    const venda = await this.vendaModel.findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { $inc: { __v: 1 } }, { new: true }).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
    }
    if (await totalPagamentosValidosCentavos(this.vendaModel.db, id, String(venda.empresaId)) > 0) {
      throw new BadRequestException('Venda com pagamento deve ser estornada antes de cancelar.');
    }

    await this.financeiroAdmService.cancelarTituloPorOrigem(
      venda.empresaId.toString(),
      'venda',
      id,
      actorId,
      actorEmpresaId,
    );

    const removed = await this.vendaModel
      .findOneAndUpdate(
        this.getEmpresaQuery(actorEmpresaId, { _id: id }),
        { statusFinanceiro: VENDA_STATUS_FINANCEIRO.CANCELADO },
        { new: true },
      )
      .exec();

    if (actorId && removed) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: removed.empresaId,
        usuarioId: actorId,
          tipoEvento: AUDITORIA_EVENTOS.VENDA_REMOVIDA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: removed._id as Types.ObjectId,
        dados: {
          operacao: 'cancelada',
          statusFinanceiro: removed.statusFinanceiro,
        },
      });
    }

    return removed;
  }

  // ItensVenda CRUD
  async createItem(createItensVendaDto: CreateItensVendaDto, actorEmpresaId?: string, actorId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.createItemAtomic(createItensVendaDto, actorEmpresaId, false, actorId));
  }

  private async createItemAtomic(createItensVendaDto: CreateItensVendaDto, actorEmpresaId?: string, skipRecalcular = false, actorId?: string) {
    const venda = await this.assertVendaPertenceEmpresa(createItensVendaDto.vendaId, actorEmpresaId, true);
    await this.assertReferenciaItemPertenceEmpresa(createItensVendaDto.tipo, createItensVendaDto.referenciaId, venda.empresaId);

    const itemData: any = {
      ...createItensVendaDto,
      valorUnitario: centavosParaDecimal128(this.parseValorCentavos(createItensVendaDto.valorUnitario, 'valorUnitario')),
      totalItem: centavosParaDecimal128(this.calcularTotalItemCentavos(createItensVendaDto)),
    };
    const createdItem = new this.itensVendaModel(itemData);
    const saved = await createdItem.save();
    if (!skipRecalcular) await this.recalcularTotaisVenda(createItensVendaDto.vendaId);
    if (!skipRecalcular && actorId) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: venda.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.VENDA_ATUALIZADA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: venda._id as Types.ObjectId,
        dados: {
          operacao: 'item_adicionado',
          itemId: saved._id,
          tipo: saved.tipo,
          quantidade: saved.quantidade,
          totalItem: saved.totalItem?.toString(),
        },
      });
    }
    return saved;
  }

  async findAllItems(empresaId?: string) {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }

    const vendaIds = await this.getVendaIdsEmpresa(empresaId);
    return this.itensVendaModel.find({ vendaId: { $in: vendaIds } }).exec();
  }

  async findOneItem(id: string, empresaId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      return null;
    }

    await this.assertVendaPertenceEmpresa(item.vendaId.toString(), empresaId);
    return item;
  }

  async updateItem(id: string, updateItensVendaDto: UpdateItensVendaDto, actorEmpresaId?: string, actorId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.updateItemAtomic(id, updateItensVendaDto, actorEmpresaId, actorId));
  }

  private async updateItemAtomic(id: string, updateItensVendaDto: UpdateItensVendaDto, actorEmpresaId?: string, actorId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de venda nao encontrado.');
    }

    const vendaAtual = await this.assertVendaPertenceEmpresa(item.vendaId.toString(), actorEmpresaId, true);
    const vendaDestino = updateItensVendaDto.vendaId
      ? await this.assertVendaPertenceEmpresa(updateItensVendaDto.vendaId.toString(), actorEmpresaId, true)
      : vendaAtual;
    const tipo = updateItensVendaDto.tipo ?? item.tipo;
    const referenciaId = updateItensVendaDto.referenciaId ?? item.referenciaId.toString();
    await this.assertReferenciaItemPertenceEmpresa(tipo, referenciaId, vendaDestino.empresaId);

    const updateData: any = { ...updateItensVendaDto };
    const quantidade = updateItensVendaDto.quantidade ?? item.quantidade;
    const valorUnitario = updateItensVendaDto.valorUnitario ?? item.valorUnitario?.toString();
    updateData.valorUnitario = centavosParaDecimal128(this.parseValorCentavos(valorUnitario, 'valorUnitario'));
    updateData.totalItem = centavosParaDecimal128(this.calcularTotalItemCentavos({ quantidade, valorUnitario }));

    const updated = await this.itensVendaModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    await this.recalcularTotaisVenda(item.vendaId.toString());
    if (updateItensVendaDto.vendaId && updateItensVendaDto.vendaId !== item.vendaId.toString()) {
      await this.recalcularTotaisVenda(updateItensVendaDto.vendaId);
    }
    if (actorId && updated) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: vendaAtual.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.VENDA_ATUALIZADA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: vendaAtual._id as Types.ObjectId,
        dados: {
          operacao: 'item_atualizado',
          itemId: updated._id,
          tipo: updated.tipo,
          quantidadeAnterior: item.quantidade,
          quantidadeAtual: updated.quantidade,
          totalItemAnterior: item.totalItem?.toString(),
          totalItemAtual: updated.totalItem?.toString(),
          vendaDestinoId: vendaDestino._id.toString(),
        },
      });
      if (vendaDestino._id.toString() !== vendaAtual._id.toString()) {
        await this.auditoriaService.registrarEventoNegocio({
          empresaId: vendaDestino.empresaId,
          usuarioId: actorId,
          tipoEvento: AUDITORIA_EVENTOS.VENDA_ATUALIZADA,
          entidade: AUDITORIA_ENTIDADES.VENDA,
          entidadeId: vendaDestino._id as Types.ObjectId,
          dados: { operacao: 'item_recebido', itemId: updated._id, tipo: updated.tipo, quantidade: updated.quantidade },
        });
      }
    }
    return updated;
  }

  async removeItem(id: string, actorEmpresaId?: string, actorId?: string) {
    return executarTransacaoFinanceira(this.vendaModel.db, () => this.removeItemAtomic(id, actorEmpresaId, actorId));
  }

  private async removeItemAtomic(id: string, actorEmpresaId?: string, actorId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de venda nao encontrado.');
    }

    const vendaId = item.vendaId.toString();
    const venda = await this.assertVendaPertenceEmpresa(vendaId, actorEmpresaId, true);
    const removed = await this.itensVendaModel.findByIdAndDelete(id).exec();
    await this.recalcularTotaisVenda(vendaId);
    if (actorId && removed) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: venda.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.VENDA_ATUALIZADA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: venda._id as Types.ObjectId,
        dados: {
          operacao: 'item_removido',
          itemId: removed._id,
          tipo: removed.tipo,
          quantidade: removed.quantidade,
          totalItem: removed.totalItem?.toString(),
        },
      });
    }
    return removed;
  }

  private async attachItensVenda(venda: any) {
    const itens = await this.itensVendaModel
      .find({ vendaId: venda._id })
      .lean()
      .exec();

    const populatedItens = await Promise.all(
      itens.map(async (item: any) => {
        let referenciaDetails: any = null;
        try {
          if (item.tipo === 'produto') {
            referenciaDetails = await this.vendaModel.db
              .model('Produto')
              .findOne({ _id: item.referenciaId, empresaId: venda.empresaId })
              .select('nome codigoInterno precoVenda tipoProduto aparelhoModeloId qualidade temAro cor')
              .lean()
              .exec();
          } else if (item.tipo === 'servico') {
            referenciaDetails = await this.vendaModel.db
              .model('Servico')
              .findOne({ _id: item.referenciaId, empresaId: venda.empresaId })
              .select('nome')
              .lean()
              .exec();
          }
        } catch (_error) {
          referenciaDetails = null;
        }
        return {
          ...item,
          referencia: referenciaDetails,
        };
      })
    );

    const totalPagoCentavos = await totalPagamentosValidosCentavos(this.vendaModel.db, String(venda._id), String(venda.empresaId));
    return {
      ...venda,
      totalPago: totalPagoCentavos / 100,
      saldoRestante: Math.max(0, dinheiroParaCentavos(venda.total) - totalPagoCentavos) / 100,
      statusFinanceiro: venda.statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO
        ? VENDA_STATUS_FINANCEIRO.CANCELADO
        : calcularStatusFinanceiroVenda(venda.total, totalPagoCentavos / 100),
      itens: populatedItens,
    };
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    if (!empresaId) throw new UnauthorizedException('Empresa do usuario nao informada.');
    return { ...base, empresaId };
  }

  private assertEmpresaPermitida(empresaId?: string, actorEmpresaId?: string) {
    if (!actorEmpresaId) throw new UnauthorizedException('Empresa do usuario nao informada.');
    if (actorEmpresaId && empresaId && String(empresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Empresa do registro nao corresponde a empresa do usuario autenticado.');
    }
  }

  private async assertVendaPertenceEmpresa(vendaId: string, empresaId?: string, bloquear = false) {
    if (!Types.ObjectId.isValid(vendaId)) {
      throw new BadRequestException('Venda invalida.');
    }

    const query = this.getEmpresaQuery(empresaId, { _id: vendaId });
    const venda = await (bloquear
      ? this.vendaModel.findOneAndUpdate(query, { $inc: { __v: 1 } }, { new: true })
      : this.vendaModel.findOne(query)).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
    }

    return venda;
  }

  private async assertReferenciaItemPertenceEmpresa(tipo: unknown, referenciaId: unknown, empresaId: unknown) {
    if (tipo === 'produto') {
      await assertTenantReference(this.vendaModel.db, 'Produto', referenciaId, empresaId);
      return;
    }

    if (tipo === 'servico') {
      await assertTenantReference(this.vendaModel.db, 'Servico', referenciaId, empresaId);
      return;
    }

    throw new BadRequestException('Tipo do item de venda invalido.');
  }

  private async getVendaIdsEmpresa(empresaId: string) {
    const vendas = await this.vendaModel.find({ empresaId }).select('_id').lean().exec();
    return vendas.map((venda) => venda._id);
  }

  private calcularTotaisVenda(itens: any[] | undefined, dto: { subtotal?: unknown; descontos?: unknown; total?: unknown }) {
    const subtotalCentavos = Array.isArray(itens) && itens.length > 0
      ? itens.reduce((sum, item) => sum + this.calcularTotalItemCentavos(item), 0)
      : this.parseValorCentavos(dto.subtotal ?? dto.total ?? 0, 'subtotal');
    const descontosCentavos = dto.descontos !== undefined
      ? this.parseValorCentavos(dto.descontos, 'descontos')
      : 0;

    if (subtotalCentavos < 0 || descontosCentavos < 0) {
      throw new BadRequestException('Valores da venda nao podem ser negativos.');
    }

    if (descontosCentavos > subtotalCentavos) {
      throw new BadRequestException('Desconto nao pode ser maior que o subtotal da venda.');
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

  private async recalcularTotaisVenda(vendaId: string) {
    const venda = await this.vendaModel.findById(vendaId).exec();
    if (!venda) {
      return;
    }

    const itens = await this.itensVendaModel.find({ vendaId }).lean().exec();
    const totais = this.calcularTotaisVenda(itens, { descontos: venda.descontos?.toString(), subtotal: '0' });
    const totalPagoCentavos = await totalPagamentosValidosCentavos(this.vendaModel.db, vendaId, String(venda.empresaId));
    if (totais.totalCentavos < totalPagoCentavos) {
      throw new BadRequestException('O total da venda nao pode ser menor que o valor ja recebido. Estorne o pagamento antes de alterar o total.');
    }
    const updated = await this.vendaModel.findByIdAndUpdate(vendaId, {
      subtotal: centavosParaDecimal128(totais.subtotalCentavos),
      descontos: centavosParaDecimal128(totais.descontosCentavos),
      total: centavosParaDecimal128(totais.totalCentavos),
      statusFinanceiro: venda.statusFinanceiro === 'cancelado' ? 'cancelado'
        : calcularStatusFinanceiroVenda(totais.totalCentavos / 100, totalPagoCentavos / 100),
    }, { new: true }).exec();
    if (updated) await this.financeiroAdmService.sincronizarTituloVenda(updated, undefined, String(venda.empresaId));
  }
}
