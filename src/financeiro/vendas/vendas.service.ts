import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Venda, VendaDocument } from './schemas/venda.schema';
import { ItensVenda, ItensVendaDocument } from './schemas/itens-venda.schema';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { CreateItensVendaDto } from './dto/create-itens-venda.dto';
import { UpdateItensVendaDto } from './dto/update-itens-venda.dto';
import { isVendaStatusFinanceiro } from './venda-financeiro.states';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { FinanceiroAdmService } from '../financeiro-adm/financeiro-adm.service';

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

    if (!isVendaStatusFinanceiro(dto.statusFinanceiro)) {
      throw new BadRequestException(`Status financeiro invalido: ${dto.statusFinanceiro}`);
    }

    if (!['venda_direta', 'ordem_servico'].includes(dto.origemTipo)) {
      throw new BadRequestException('Origem da venda invalida. Use venda direta ou ordem de servico.');
    }

    const vendaData: any = { ...dto };
    if (dto.subtotal) {
      vendaData.subtotal = Types.Decimal128.fromString(dto.subtotal);
    }
    if (dto.descontos) {
      vendaData.descontos = Types.Decimal128.fromString(dto.descontos);
    }
    if (dto.total) {
      vendaData.total = Types.Decimal128.fromString(dto.total);
    }
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
          totalItem: String(item.totalItem),
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
          total: dto.total,
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
      .populate('clienteId', 'nome cpfCnpj email')
      .lean()
      .exec();
    return Promise.all(vendas.map((venda) => this.attachItensVenda(venda)));
  }

  async findOne(id: string, empresaId?: string) {
    const venda = await this.vendaModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('clienteId', 'nome cpfCnpj email')
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
    if (dto.subtotal) {
      updateData.subtotal = Types.Decimal128.fromString(dto.subtotal);
    }
    if (dto.descontos) {
      updateData.descontos = Types.Decimal128.fromString(dto.descontos);
    }
    if (dto.total) {
      updateData.total = Types.Decimal128.fromString(dto.total);
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
          totalItem: String(item.totalItem),
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

    const removed = await this.vendaModel.findOneAndDelete(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();

    if (actorId && removed) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: removed.empresaId,
        usuarioId: actorId,
          tipoEvento: AUDITORIA_EVENTOS.VENDA_REMOVIDA,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: removed._id as Types.ObjectId,
        dados: {
          operacao: 'removida',
          statusFinanceiro: removed.statusFinanceiro,
        },
      });
    }

    return removed;
  }

  // ItensVenda CRUD
  async createItem(createItensVendaDto: CreateItensVendaDto, actorEmpresaId?: string) {
    await this.assertVendaPertenceEmpresa(createItensVendaDto.vendaId, actorEmpresaId);

    const itemData: any = { ...createItensVendaDto };
    if (createItensVendaDto.valorUnitario) {
      itemData.valorUnitario = Types.Decimal128.fromString(createItensVendaDto.valorUnitario);
    }
    if (createItensVendaDto.totalItem) {
      itemData.totalItem = Types.Decimal128.fromString(createItensVendaDto.totalItem);
    }
    const createdItem = new this.itensVendaModel(itemData);
    return createdItem.save();
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

    await this.assertVendaPertenceEmpresa((updateItensVendaDto.vendaId ?? item.vendaId).toString(), actorEmpresaId);

    const updateData: any = { ...updateItensVendaDto };
    if (updateItensVendaDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(updateItensVendaDto.valorUnitario);
    }
    if (updateItensVendaDto.totalItem) {
      updateData.totalItem = Types.Decimal128.fromString(updateItensVendaDto.totalItem);
    }
    return this.itensVendaModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async removeItem(id: string, actorEmpresaId?: string) {
    const item = await this.itensVendaModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de venda nao encontrado.');
    }

    await this.assertVendaPertenceEmpresa(item.vendaId.toString(), actorEmpresaId);
    return this.itensVendaModel.findByIdAndDelete(id).exec();
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
              .findById(item.referenciaId)
              .select('nome codigoInterno')
              .lean()
              .exec();
          } else if (item.tipo === 'servico') {
            referenciaDetails = await this.vendaModel.db
              .model('Servico')
              .findById(item.referenciaId)
              .select('nome')
              .lean()
              .exec();
          }
        } catch (e) {
          console.error('Erro ao popular item de venda:', e);
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
    if (!empresaId) {
      return;
    }

    const venda = await this.vendaModel.exists({ _id: vendaId, empresaId }).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
    }
  }

  private async getVendaIdsEmpresa(empresaId: string) {
    const vendas = await this.vendaModel.find({ empresaId }).select('_id').lean().exec();
    return vendas.map((venda) => venda._id);
  }
}
