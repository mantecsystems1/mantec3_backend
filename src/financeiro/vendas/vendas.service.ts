import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Venda, VendaDocument } from './schemas/venda.schema';
import { ItensVenda, ItensVendaDocument } from './schemas/itens-venda.schema';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { CreateItensVendaDto } from './dto/create-itens-venda.dto';
import { UpdateItensVendaDto } from './dto/update-itens-venda.dto';
import { VENDA_STATUS_FINANCEIRO, isVendaStatusFinanceiro } from './venda-financeiro.states';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { FinanceiroAdmService } from '../financeiro-adm/financeiro-adm.service';
import { centavosParaDecimal128, dinheiroParaCentavos } from '../financeiro-adm/financeiro-adm.types';
import { assertTenantReference } from '../../common/tenant-reference';

@Injectable()
export class VendasService {
  constructor(
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    @InjectModel(ItensVenda.name) private itensVendaModel: Model<ItensVendaDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly financeiroAdmService: FinanceiroAdmService,
  ) {}

  // Venda CRUD
  async create(createVendaDto: CreateVendaDto, actorId?: string, actorEmpresaId?: string) {
    const { itens = [], ...dto } = createVendaDto;
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    await assertTenantReference(this.vendaModel.db, 'Cliente', dto.clienteId, actorEmpresaId ?? dto.empresaId);

    if (!isVendaStatusFinanceiro(dto.statusFinanceiro)) {
      throw new BadRequestException(`Status financeiro invalido: ${dto.statusFinanceiro}`);
    }

    if (!['venda_direta', 'ordem_servico'].includes(dto.origemTipo)) {
      throw new BadRequestException('Origem da venda invalida. Use venda direta ou ordem de servico.');
    }

    const totais = this.calcularTotaisVenda(itens, dto);
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
        await this.createItem({
          vendaId: createdVenda._id.toString(),
          tipo: item.tipo,
          referenciaId: item.referenciaId,
          quantidade: Number(item.quantidade),
          valorUnitario: String(item.valorUnitario),
          totalItem: String(this.calcularTotalItemCentavos(item)),
        }, actorEmpresaId);
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
    const { itens, ...dto } = updateVendaDto;
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const vendaAtual = await this.vendaModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
    if (!vendaAtual) {
      throw new NotFoundException('Venda nao encontrada.');
    }
    await assertTenantReference(this.vendaModel.db, 'Cliente', dto.clienteId ?? vendaAtual.clienteId, vendaAtual.empresaId);
    if (dto.empresaId && String(dto.empresaId) !== String(vendaAtual.empresaId)) {
      throw new BadRequestException('Venda nao pode ser movida para outra empresa.');
    }

    if (dto.statusFinanceiro === 'cancelado') {
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
      const totais = this.calcularTotaisVenda(itens, dto);
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
    const updated = await this.vendaModel.findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException('Venda nao encontrada.');
    }

    if (itens !== undefined) {
      await this.itensVendaModel.deleteMany({ vendaId: id });
      if (Array.isArray(itens) && itens.length > 0) {
        for (const item of itens) {
          await this.createItem({
            vendaId: id,
            tipo: item.tipo,
            referenciaId: item.referenciaId,
            quantidade: Number(item.quantidade),
            valorUnitario: String(item.valorUnitario),
            totalItem: String(this.calcularTotalItemCentavos(item)),
          }, actorEmpresaId);
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
    const venda = await this.vendaModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
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
  async createItem(createItensVendaDto: CreateItensVendaDto, actorEmpresaId?: string) {
    const venda = await this.assertVendaPertenceEmpresa(createItensVendaDto.vendaId, actorEmpresaId);
    await this.assertReferenciaItemPertenceEmpresa(createItensVendaDto.tipo, createItensVendaDto.referenciaId, venda.empresaId);

    const itemData: any = {
      ...createItensVendaDto,
      valorUnitario: centavosParaDecimal128(this.parseValorCentavos(createItensVendaDto.valorUnitario, 'valorUnitario')),
      totalItem: centavosParaDecimal128(this.calcularTotalItemCentavos(createItensVendaDto)),
    };
    const createdItem = new this.itensVendaModel(itemData);
    const saved = await createdItem.save();
    await this.recalcularTotaisVenda(createItensVendaDto.vendaId);
    return saved;
  }

  async findAllItems(empresaId?: string) {
    if (!empresaId) {
      return this.itensVendaModel.find().exec();
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

  async updateItem(id: string, updateItensVendaDto: UpdateItensVendaDto, actorEmpresaId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de venda nao encontrado.');
    }

    const vendaAtual = await this.assertVendaPertenceEmpresa(item.vendaId.toString(), actorEmpresaId);
    const vendaDestino = updateItensVendaDto.vendaId
      ? await this.assertVendaPertenceEmpresa(updateItensVendaDto.vendaId.toString(), actorEmpresaId)
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
    return updated;
  }

  async removeItem(id: string, actorEmpresaId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de venda nao encontrado.');
    }

    const vendaId = item.vendaId.toString();
    await this.assertVendaPertenceEmpresa(vendaId, actorEmpresaId);
    const removed = await this.itensVendaModel.findByIdAndDelete(id).exec();
    await this.recalcularTotaisVenda(vendaId);
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

    return {
      ...venda,
      itens: populatedItens,
    };
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private assertEmpresaPermitida(empresaId?: string, actorEmpresaId?: string) {
    if (actorEmpresaId && empresaId && String(empresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Empresa do registro nao corresponde a empresa do usuario autenticado.');
    }
  }

  private async assertVendaPertenceEmpresa(vendaId: string, empresaId?: string) {
    if (!Types.ObjectId.isValid(vendaId)) {
      throw new BadRequestException('Venda invalida.');
    }

    const venda = await this.vendaModel.findOne(this.getEmpresaQuery(empresaId, { _id: vendaId })).select('_id empresaId').lean().exec();
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
    const totais = this.calcularTotaisVenda(itens, { descontos: venda.descontos?.toString(), subtotal: venda.subtotal?.toString() });
    await this.vendaModel.findByIdAndUpdate(vendaId, {
      subtotal: centavosParaDecimal128(totais.subtotalCentavos),
      descontos: centavosParaDecimal128(totais.descontosCentavos),
      total: centavosParaDecimal128(totais.totalCentavos),
    }).exec();
  }
}
