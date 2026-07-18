import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Venda, VendaDocument } from './schemas/venda.schema';
import { ItensVenda, ItensVendaDocument } from './schemas/itens-venda.schema';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { CreateItensVendaDto } from './dto/create-itens-venda.dto';
import { UpdateItensVendaDto } from './dto/update-itens-venda.dto';

@Injectable()
export class VendasService {
  constructor(
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    @InjectModel(ItensVenda.name) private itensVendaModel: Model<ItensVendaDocument>,
  ) {}

  // Venda CRUD
  async create(createVendaDto: CreateVendaDto) {
    const { itens = [], ...dto } = createVendaDto;
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
        });
      }
    }

    return this.findOne(createdVenda._id.toString());
  }

  async findAll() {
    const vendas = await this.vendaModel
      .find()
      .populate('clienteId', 'nome cpfCnpj email')
      .lean()
      .exec();
    return Promise.all(vendas.map((venda) => this.attachItensVenda(venda)));
  }

  async findOne(id: string) {
    const venda = await this.vendaModel
      .findById(id)
      .populate('clienteId', 'nome cpfCnpj email')
      .lean()
      .exec();
    return venda ? this.attachItensVenda(venda) : null;
  }

  async update(id: string, updateVendaDto: UpdateVendaDto) {
    const { itens, ...dto } = updateVendaDto;
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
    await this.vendaModel.findByIdAndUpdate(id, updateData, { new: true }).exec();

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
          });
        }
      }
    }

    return this.findOne(id);
  }

  remove(id: string) {
    return this.vendaModel.findByIdAndDelete(id).exec();
  }

  // ItensVenda CRUD
  createItem(createItensVendaDto: CreateItensVendaDto) {
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

  findAllItems() {
    return this.itensVendaModel.find().exec();
  }

  findOneItem(id: string) {
    return this.itensVendaModel.findById(id).exec();
  }

  updateItem(id: string, updateItensVendaDto: UpdateItensVendaDto) {
    const updateData: any = { ...updateItensVendaDto };
    if (updateItensVendaDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(updateItensVendaDto.valorUnitario);
    }
    if (updateItensVendaDto.totalItem) {
      updateData.totalItem = Types.Decimal128.fromString(updateItensVendaDto.totalItem);
    }
    return this.itensVendaModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  removeItem(id: string) {
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
}