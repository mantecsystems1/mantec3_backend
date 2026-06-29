import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fornecedor, FornecedorDocument } from './schemas/fornecedor.schema';
import { PedidosCompra, PedidosCompraDocument } from './schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraDocument } from './schemas/itens-pedido-compra.schema';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { CreatePedidoCompraDto } from './dto/create-pedido-compra.dto';
import { UpdatePedidoCompraDto } from './dto/update-pedido-compra.dto';
import { CreateItensPedidoCompraDto } from './dto/create-itens-pedido-compra.dto';
import { UpdateItensPedidoCompraDto } from './dto/update-itens-pedido-compra.dto';

@Injectable()
export class ComprasService {
  constructor(
    @InjectModel(Fornecedor.name) private fornecedorModel: Model<FornecedorDocument>,
    @InjectModel(PedidosCompra.name) private pedidosCompraModel: Model<PedidosCompraDocument>,
    @InjectModel(ItensPedidoCompra.name) private itensPedidoCompraModel: Model<ItensPedidoCompraDocument>,
  ) {}

  // Fornecedor CRUD
  createFornecedor(createFornecedorDto: CreateFornecedorDto) {
    const createdFornecedor = new this.fornecedorModel(createFornecedorDto);
    return createdFornecedor.save();
  }

  findAllFornecedores() {
    return this.fornecedorModel.find().exec();
  }

  findOneFornecedor(id: string) {
    return this.fornecedorModel.findById(id).exec();
  }

  updateFornecedor(id: string, updateFornecedorDto: UpdateFornecedorDto) {
    return this.fornecedorModel.findByIdAndUpdate(id, updateFornecedorDto, { new: true }).exec();
  }

  removeFornecedor(id: string) {
    return this.fornecedorModel.findByIdAndDelete(id).exec();
  }

  // PedidosCompra CRUD
  createPedidoCompra(createPedidoCompraDto: CreatePedidoCompraDto) {
    const createdPedidoCompra = new this.pedidosCompraModel(createPedidoCompraDto);
    return createdPedidoCompra.save();
  }

  findAllPedidosCompra() {
    return this.pedidosCompraModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  findOnePedidoCompra(id: string) {
    return this.pedidosCompraModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  updatePedidoCompra(id: string, updatePedidoCompraDto: UpdatePedidoCompraDto) {
    return this.pedidosCompraModel.findByIdAndUpdate(id, updatePedidoCompraDto, { new: true }).exec();
  }

  removePedidoCompra(id: string) {
    return this.pedidosCompraModel.findByIdAndDelete(id).exec();
  }

  // ItensPedidoCompra CRUD
  createItensPedidoCompra(createItensPedidoCompraDto: CreateItensPedidoCompraDto) {
    const itemData: any = { ...createItensPedidoCompraDto };
    if (createItensPedidoCompraDto.valorUnitario) {
      itemData.valorUnitario = Types.Decimal128.fromString(createItensPedidoCompraDto.valorUnitario);
    }
    const createdItem = new this.itensPedidoCompraModel(itemData);
    return createdItem.save();
  }

  findAllItensPedidoCompra() {
    return this.itensPedidoCompraModel.find().exec();
  }

  findOneItensPedidoCompra(id: string) {
    return this.itensPedidoCompraModel.findById(id).exec();
  }

  updateItensPedidoCompra(id: string, updateItensPedidoCompraDto: UpdateItensPedidoCompraDto) {
    const updateData: any = { ...updateItensPedidoCompraDto };
    if (updateItensPedidoCompraDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(updateItensPedidoCompraDto.valorUnitario);
    }
    return this.itensPedidoCompraModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  removeItensPedidoCompra(id: string) {
    return this.itensPedidoCompraModel.findByIdAndDelete(id).exec();
  }
}
