import { Injectable, BadRequestException } from '@nestjs/common';
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
  ) { }

  // Fornecedor CRUD
  async createFornecedor(createFornecedorDto: CreateFornecedorDto) {
    console.log('CreateFornecedor DTO recebido:', createFornecedorDto);

    const normalizedCnpj = createFornecedorDto.cnpj.replace(/\D/g, '');

    const existing = await this.fornecedorModel.findOne({
      empresaId: createFornecedorDto.empresaId,
      cnpj: normalizedCnpj,
    });

    if (existing) {
      throw new BadRequestException('Fornecedor com este CNPJ já existe');
    }

    try {
      const fornecedor = await this.fornecedorModel.create({
        ...createFornecedorDto,
        cnpj: normalizedCnpj,
      });

      return fornecedor;
    } catch (err: any) {
      console.error('Erro Mongo:', err);

      if (err?.code === 11000) {
        throw new BadRequestException('Fornecedor com este CNPJ já existe');
      }

      throw err;
    }

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
  async createPedidoCompra(createPedidoCompraDto: CreatePedidoCompraDto) {
    try {
      console.log(
        'DTO recebido:\n',
        JSON.stringify(createPedidoCompraDto, null, 2),
      );

      const { itens = [], ...pedidoDto } = createPedidoCompraDto;

      console.log('Itens recebidos:', itens);

      // Cria o pedido
      const pedido = await this.pedidosCompraModel.create(pedidoDto);

      console.log('Pedido criado:', pedido._id);

      // Salva os itens
      if (Array.isArray(itens) && itens.length > 0) {
        for (const item of itens) {
          console.log('Salvando item:', item);

          await this.createItensPedidoCompra({
            pedidoCompraId: pedido._id.toString(),
            produtoId: String(item.produtoId),
            quantidade: Number(item.quantidade),
            valorUnitario: String(item.valorUnitario),
          });
        }
      } else {
        console.warn('Nenhum item recebido para este pedido.');
      }

      // Retorna o pedido completo com itens
      return await this.findOnePedidoCompra(pedido._id.toString());
    } catch (error) {
      console.error('Erro ao criar pedido de compra:', error);
      throw error;
    }
  }

  async findAllPedidosCompra() {
    const pedidos = await this.pedidosCompraModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .lean()
      .exec();

    return Promise.all(pedidos.map((pedido) => this.attachItensPedidoCompra(pedido)));
  }

  async findOnePedidoCompra(id: string) {
    const pedido = await this.pedidosCompraModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .lean()
      .exec();

    return pedido ? this.attachItensPedidoCompra(pedido) : null;
  }

  updatePedidoCompra(id: string, updatePedidoCompraDto: UpdatePedidoCompraDto) {
    return this.pedidosCompraModel.findByIdAndUpdate(id, updatePedidoCompraDto, { new: true }).exec();
  }

  removePedidoCompra(id: string) {
    return this.pedidosCompraModel.findByIdAndDelete(id).exec();
  }

  // ItensPedidoCompra CRUD
  createItensPedidoCompra(createItensPedidoCompraDto: CreateItensPedidoCompraDto) {
    try {
      const itemData: any = { ...createItensPedidoCompraDto };
      if (
        createItensPedidoCompraDto.valorUnitario !== undefined &&
        createItensPedidoCompraDto.valorUnitario !== null &&
        createItensPedidoCompraDto.valorUnitario !== ''
      ) {
        try {
          const precoStr = String(createItensPedidoCompraDto.valorUnitario).replace(',', '.');
          if (!/^-?\d+(\.\d+)?$/.test(precoStr)) {
            throw new Error('Formato inválido para valorUnitario');
          }
          itemData.valorUnitario = Types.Decimal128.fromString(precoStr);
        } catch (err) {
          throw new BadRequestException('valorUnitario inválido');
        }
      }
      const createdItem = new this.itensPedidoCompraModel(itemData);
      return createdItem.save();
    } catch (error) {
      console.error('Erro ao criar item do pedido de compra:', error);
      throw error;
    }
  }

  findAllItensPedidoCompra() {
    return this.itensPedidoCompraModel
      .find()
      .populate('pedidoCompraId', 'status observacoes')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findOneItensPedidoCompra(id: string) {
    return this.itensPedidoCompraModel
      .findById(id)
      .populate('pedidoCompraId', 'status observacoes')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
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

  private async attachItensPedidoCompra(pedido: any) {
    const itens = await this.itensPedidoCompraModel
      .find({ pedidoCompraId: pedido._id })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .lean()
      .exec();

    const total = itens.reduce((sum, item: any) => {
      const decimalValue = item.valorUnitario?.$numberDecimal ?? item.valorUnitario?.toString?.() ?? '0';
      return sum + Number(decimalValue) * Number(item.quantidade ?? 0);
    }, 0);

    return {
      ...pedido,
      itens,
      total,
    };
  }
}
