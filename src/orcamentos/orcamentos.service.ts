import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Orcamento, OrcamentoDocument } from './schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from './schemas/itens-orcamento.schema';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';

@Injectable()
export class OrcamentosService {
  constructor(
    @InjectModel(Orcamento.name) private orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private itensOrcamentoModel: Model<ItensOrcamentoDocument>,
  ) {}

  // Orcamento CRUD
  create(createOrcamentoDto: CreateOrcamentoDto) {
    const orcamentoData: any = { ...createOrcamentoDto };
    if (createOrcamentoDto.subtotal) {
      orcamentoData.subtotal = Types.Decimal128.fromString(String(createOrcamentoDto.subtotal));
    }
    if (createOrcamentoDto.descontos) {
      orcamentoData.descontos = Types.Decimal128.fromString(String(createOrcamentoDto.descontos));
    }
    if (createOrcamentoDto.total) {
      orcamentoData.total = Types.Decimal128.fromString(String(createOrcamentoDto.total));
    }
    const createdOrcamento = new this.orcamentoModel(orcamentoData);
    return createdOrcamento.save();
  }

  findAll() {
    return this.orcamentoModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('criadoPor', 'nome email')
      .exec();
  }

  findOne(id: string) {
    return this.orcamentoModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('criadoPor', 'nome email')
      .exec();
  }

  update(id: string, updateOrcamentoDto: UpdateOrcamentoDto) {
    const updateData: any = { ...updateOrcamentoDto };
    if (updateOrcamentoDto.subtotal) {
      updateData.subtotal = Types.Decimal128.fromString(String(updateOrcamentoDto.subtotal));
    }
    if (updateOrcamentoDto.descontos) {
      updateData.descontos = Types.Decimal128.fromString(String(updateOrcamentoDto.descontos));
    }
    if (updateOrcamentoDto.total) {
      updateData.total = Types.Decimal128.fromString(String(updateOrcamentoDto.total));
    }
    return this.orcamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  remove(id: string) {
    return this.orcamentoModel.findByIdAndDelete(id).exec();
  }

  // ItensOrcamento CRUD
  createItem(createItensOrcamentoDto: CreateItensOrcamentoDto) {
    const itemData: any = { ...createItensOrcamentoDto };
    if (createItensOrcamentoDto.valorUnitario) {
      itemData.valorUnitario = Types.Decimal128.fromString(String(createItensOrcamentoDto.valorUnitario));
    }
    if (createItensOrcamentoDto.totalItem) {
      itemData.totalItem = Types.Decimal128.fromString(String(createItensOrcamentoDto.totalItem));
    }
    const createdItem = new this.itensOrcamentoModel(itemData);
    return createdItem.save();
  }

  findAllItems() {
    return this.itensOrcamentoModel.find().exec();
  }

  findItemsByOrcamento(orcamentoId: string) {
    return this.itensOrcamentoModel.find({ orcamentoId }).exec();
  }

  findOneItem(id: string) {
    return this.itensOrcamentoModel.findById(id).exec();
  }

  updateItem(id: string, updateItensOrcamentoDto: UpdateItensOrcamentoDto) {
    const updateData: any = { ...updateItensOrcamentoDto };
    if (updateItensOrcamentoDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(String(updateItensOrcamentoDto.valorUnitario));
    }
    if (updateItensOrcamentoDto.totalItem) {
      updateData.totalItem = Types.Decimal128.fromString(String(updateItensOrcamentoDto.totalItem));
    }
    return this.itensOrcamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  removeItem(id: string) {
    return this.itensOrcamentoModel.findByIdAndDelete(id).exec();
  }
}
