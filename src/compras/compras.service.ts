import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fornecedor, FornecedorDocument } from './schemas/fornecedor.schema';
import { PedidosCompra, PedidosCompraDocument } from './schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraDocument } from './schemas/itens-pedido-compra.schema';
import { MovimentosEstoque, MovimentosEstoqueDocument } from '../estoque/schemas/movimento-estoque.schema';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { CreatePedidoCompraDto } from './dto/create-pedido-compra.dto';
import { UpdatePedidoCompraDto } from './dto/update-pedido-compra.dto';
import { CreateItensPedidoCompraDto } from './dto/create-itens-pedido-compra.dto';
import { UpdateItensPedidoCompraDto } from './dto/update-itens-pedido-compra.dto';
import { MOVIMENTO_ESTOQUE_ORIGEM, MOVIMENTO_ESTOQUE_TIPO } from '../estoque/movimento-estoque.types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';

const PEDIDO_COMPRA_STATUS_RECEBIDO = 'recebido';

@Injectable()
export class ComprasService {
  constructor(
    @InjectModel(Fornecedor.name) private fornecedorModel: Model<FornecedorDocument>,
    @InjectModel(PedidosCompra.name) private pedidosCompraModel: Model<PedidosCompraDocument>,
    @InjectModel(ItensPedidoCompra.name) private itensPedidoCompraModel: Model<ItensPedidoCompraDocument>,
    @InjectModel(MovimentosEstoque.name) private movimentosEstoqueModel: Model<MovimentosEstoqueDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) { }

  // Fornecedor CRUD
  async createFornecedor(createFornecedorDto: CreateFornecedorDto, actorId?: string, actorEmpresaId?: string) {
    console.log('CreateFornecedor DTO recebido:', createFornecedorDto);
    this.assertEmpresaPermitida(createFornecedorDto.empresaId, actorEmpresaId);

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

      if (actorId) {
        await this.registrarAuditoriaFornecedor(fornecedor, actorId, 'criado');
      }

      return fornecedor;
    } catch (err: any) {
      console.error('Erro Mongo:', err);

      if (err?.code === 11000) {
        throw new BadRequestException('Fornecedor com este CNPJ já existe');
      }

      throw err;
    }

  }

  findAllFornecedores(empresaId?: string) {
    return this.fornecedorModel.find(this.getEmpresaQuery(empresaId)).exec();
  }

  findOneFornecedor(id: string, empresaId?: string) {
    return this.fornecedorModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
  }

  async updateFornecedor(id: string, updateFornecedorDto: UpdateFornecedorDto, actorId?: string, actorEmpresaId?: string) {
    if (updateFornecedorDto.empresaId) {
      this.assertEmpresaPermitida(updateFornecedorDto.empresaId, actorEmpresaId);
    }

    const fornecedor = await this.fornecedorModel.findOneAndUpdate(
      this.getEmpresaQuery(actorEmpresaId, { _id: id }),
      updateFornecedorDto,
      { new: true },
    ).exec();

    if (actorId && fornecedor) {
      await this.registrarAuditoriaFornecedor(fornecedor, actorId, 'atualizado');
    }

    return fornecedor;
  }

  async removeFornecedor(id: string, actorId?: string, actorEmpresaId?: string) {
    const fornecedor = await this.fornecedorModel.findOneAndDelete(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();

    if (actorId && fornecedor) {
      await this.registrarAuditoriaFornecedor(fornecedor, actorId, 'removido');
    }

    return fornecedor;
  }

  // PedidosCompra CRUD
  async createPedidoCompra(createPedidoCompraDto: CreatePedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    try {
      console.log(
        'DTO recebido:\n',
        JSON.stringify(createPedidoCompraDto, null, 2),
      );

      const { itens = [], ...pedidoDto } = createPedidoCompraDto;
      this.assertEmpresaPermitida(pedidoDto.empresaId, actorEmpresaId);
      await this.assertFornecedorPertenceEmpresa(pedidoDto.fornecedorId, actorEmpresaId);

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
          }, actorId, actorEmpresaId);
        }
      } else {
        console.warn('Nenhum item recebido para este pedido.');
      }

      await this.sincronizarEntradaEstoquePedido(pedido._id.toString(), pedidoDto.status);

      if (actorId) {
        await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'criado');
      }

      // Retorna o pedido completo com itens
      return await this.findOnePedidoCompra(pedido._id.toString(), actorEmpresaId);
    } catch (error) {
      console.error('Erro ao criar pedido de compra:', error);
      throw error;
    }
  }

  async findAllPedidosCompra(empresaId?: string) {
    const pedidos = await this.pedidosCompraModel
      .find(this.getEmpresaQuery(empresaId))
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .lean()
      .exec();

    return Promise.all(pedidos.map((pedido) => this.attachItensPedidoCompra(pedido)));
  }

  async findOnePedidoCompra(id: string, empresaId?: string) {
    const pedido = await this.pedidosCompraModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('fornecedorId', 'nome cnpj')
      .lean()
      .exec();

    return pedido ? this.attachItensPedidoCompra(pedido) : null;
  }

  async updatePedidoCompra(id: string, updatePedidoCompraDto: UpdatePedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    try {
      const { itens, ...pedidoDto } = updatePedidoCompraDto;
      if (pedidoDto.empresaId) {
        this.assertEmpresaPermitida(pedidoDto.empresaId, actorEmpresaId);
      }
      if (pedidoDto.fornecedorId) {
        await this.assertFornecedorPertenceEmpresa(pedidoDto.fornecedorId, actorEmpresaId);
      }

      // Update the main pedido document
      const pedido = await this.pedidosCompraModel.findOneAndUpdate(
        this.getEmpresaQuery(actorEmpresaId, { _id: id }),
        pedidoDto,
        { new: true },
      ).exec();

      if (!pedido) {
        throw new NotFoundException('Pedido de compra nao encontrado');
      }

      // If itens are provided, update them by deleting old and creating new
      if (itens !== undefined) {
        // Delete existing items
        await this.itensPedidoCompraModel.deleteMany({ pedidoCompraId: id });

        // Save new items
        if (Array.isArray(itens) && itens.length > 0) {
          for (const item of itens) {
            await this.createItensPedidoCompra({
              pedidoCompraId: id,
              produtoId: String(item.produtoId),
              quantidade: Number(item.quantidade),
              valorUnitario: String(item.valorUnitario),
            }, actorId, actorEmpresaId);
          }
        }
      }

      await this.sincronizarEntradaEstoquePedido(id, pedido.status);

      if (actorId) {
        await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'atualizado');
      }

      return await this.findOnePedidoCompra(id, actorEmpresaId);
    } catch (error) {
      console.error('Erro ao atualizar pedido de compra:', error);
      throw error;
    }
  }

  async removePedidoCompra(id: string, actorId?: string, actorEmpresaId?: string) {
    const pedido = await this.pedidosCompraModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
    if (!pedido) {
      throw new NotFoundException('Pedido de compra nao encontrado');
    }

    await this.removerEntradasEstoquePedido(id);
    const removed = await this.pedidosCompraModel.findOneAndDelete(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();

    if (actorId && pedido) {
      await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'removido');
    }

    return removed;
  }

  // ItensPedidoCompra CRUD
  async createItensPedidoCompra(createItensPedidoCompraDto: CreateItensPedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    try {
      await this.assertPedidoCompraPertenceEmpresa(createItensPedidoCompraDto.pedidoCompraId, actorEmpresaId);

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
      const saved = await createdItem.save();

      if (actorId) {
        await this.registrarAuditoriaItemPedidoCompra(saved, actorId, 'criado');
      }

      return saved;
    } catch (error) {
      console.error('Erro ao criar item do pedido de compra:', error);
      throw error;
    }
  }

  async findAllItensPedidoCompra(empresaId?: string) {
    const query: Record<string, unknown> = {};
    if (empresaId) {
      query.pedidoCompraId = { $in: await this.getPedidoCompraIdsEmpresa(empresaId) };
    }

    return this.itensPedidoCompraModel
      .find(query)
      .populate('pedidoCompraId', 'status observacoes')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async findOneItensPedidoCompra(id: string, empresaId?: string) {
    const item = await this.itensPedidoCompraModel.findById(id).exec();
    if (!item) {
      return null;
    }

    await this.assertPedidoCompraPertenceEmpresa(item.pedidoCompraId.toString(), empresaId);

    return this.itensPedidoCompraModel
      .findById(id)
      .populate('pedidoCompraId', 'status observacoes')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async updateItensPedidoCompra(id: string, updateItensPedidoCompraDto: UpdateItensPedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    const existing = await this.itensPedidoCompraModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Item de pedido de compra nao encontrado');
    }

    await this.assertPedidoCompraPertenceEmpresa(
      (updateItensPedidoCompraDto.pedidoCompraId ?? existing.pedidoCompraId).toString(),
      actorEmpresaId,
    );

    const updateData: any = { ...updateItensPedidoCompraDto };
    if (updateItensPedidoCompraDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(updateItensPedidoCompraDto.valorUnitario);
    }
    const item = await this.itensPedidoCompraModel.findByIdAndUpdate(id, updateData, { new: true }).exec();

    if (actorId && item) {
      await this.registrarAuditoriaItemPedidoCompra(item, actorId, 'atualizado');
    }

    return item;
  }

  async removeItensPedidoCompra(id: string, actorId?: string, actorEmpresaId?: string) {
    const existing = await this.itensPedidoCompraModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Item de pedido de compra nao encontrado');
    }

    await this.assertPedidoCompraPertenceEmpresa(existing.pedidoCompraId.toString(), actorEmpresaId);

    const item = await this.itensPedidoCompraModel.findByIdAndDelete(id).exec();

    if (actorId && item) {
      await this.registrarAuditoriaItemPedidoCompra(item, actorId, 'removido');
    }

    return item;
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

  private async sincronizarEntradaEstoquePedido(pedidoCompraId: string, status?: string) {
    await this.removerEntradasEstoquePedido(pedidoCompraId);

    if (status !== PEDIDO_COMPRA_STATUS_RECEBIDO) {
      return;
    }

    const pedido = await this.pedidosCompraModel.findById(pedidoCompraId).lean().exec();
    if (!pedido) {
      throw new BadRequestException('Pedido de compra nao encontrado para entrada no estoque.');
    }

    const itens = await this.itensPedidoCompraModel.find({ pedidoCompraId }).lean().exec();
    const movimentos = itens
      .filter((item) => Number(item.quantidade) > 0)
      .map((item) => ({
        empresaId: pedido.empresaId,
        produtoId: item.produtoId,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
        quantidade: Number(item.quantidade),
        origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA,
        origemId: new Types.ObjectId(pedidoCompraId),
      }));

    if (movimentos.length > 0) {
      await this.movimentosEstoqueModel.insertMany(movimentos);
    }
  }

  private async removerEntradasEstoquePedido(pedidoCompraId: string) {
    if (!Types.ObjectId.isValid(pedidoCompraId)) {
      return;
    }

    await this.movimentosEstoqueModel.deleteMany({
      tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
      origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA,
      origemId: new Types.ObjectId(pedidoCompraId),
    });
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private assertEmpresaPermitida(empresaId?: string, actorEmpresaId?: string) {
    if (actorEmpresaId && empresaId && String(empresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Empresa do registro nao corresponde a empresa do usuario autenticado.');
    }
  }

  private async assertFornecedorPertenceEmpresa(fornecedorId: string, empresaId?: string) {
    if (!empresaId) {
      return;
    }

    const fornecedor = await this.fornecedorModel.exists({ _id: fornecedorId, empresaId }).exec();
    if (!fornecedor) {
      throw new NotFoundException('Fornecedor nao encontrado');
    }
  }

  private async assertPedidoCompraPertenceEmpresa(pedidoCompraId: string, empresaId?: string) {
    if (!empresaId) {
      return;
    }

    const pedido = await this.pedidosCompraModel.exists({ _id: pedidoCompraId, empresaId }).exec();
    if (!pedido) {
      throw new NotFoundException('Pedido de compra nao encontrado');
    }
  }

  private async getPedidoCompraIdsEmpresa(empresaId: string) {
    const pedidos = await this.pedidosCompraModel.find({ empresaId }).select('_id').lean().exec();
    return pedidos.map((pedido) => pedido._id);
  }

  private async registrarAuditoriaFornecedor(
    fornecedor: FornecedorDocument,
    actorId: string,
    operacao: 'criado' | 'atualizado' | 'removido',
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: fornecedor.empresaId,
      usuarioId: actorId,
      tipoEvento: this.getEventoAuditoriaFornecedor(operacao),
      entidade: AUDITORIA_ENTIDADES.FORNECEDOR,
      entidadeId: fornecedor._id as Types.ObjectId,
      dados: {
        operacao,
        nome: fornecedor.nome,
        cnpj: fornecedor.cnpj,
      },
    });
  }

  private async registrarAuditoriaPedidoCompra(
    pedido: PedidosCompraDocument,
    actorId: string,
    operacao: 'criado' | 'atualizado' | 'removido',
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: pedido.empresaId,
      usuarioId: actorId,
      tipoEvento: this.getEventoAuditoriaPedidoCompra(operacao),
      entidade: AUDITORIA_ENTIDADES.PEDIDO_COMPRA,
      entidadeId: pedido._id as Types.ObjectId,
      dados: {
        operacao,
        fornecedorId: pedido.fornecedorId?.toString(),
        status: pedido.status,
      },
    });
  }

  private async registrarAuditoriaItemPedidoCompra(
    item: ItensPedidoCompraDocument,
    actorId: string,
    operacao: 'criado' | 'atualizado' | 'removido',
  ) {
    const pedido = await this.pedidosCompraModel.findById(item.pedidoCompraId).exec();
    if (!pedido) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: pedido.empresaId,
      usuarioId: actorId,
      tipoEvento: this.getEventoAuditoriaItemPedidoCompra(operacao),
      entidade: AUDITORIA_ENTIDADES.ITEM_PEDIDO_COMPRA,
      entidadeId: item._id as Types.ObjectId,
      dados: {
        operacao,
        pedidoCompraId: item.pedidoCompraId?.toString(),
        produtoId: item.produtoId?.toString(),
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario?.toString(),
      },
    });
  }

  private getEventoAuditoriaFornecedor(operacao: 'criado' | 'atualizado' | 'removido') {
    if (operacao === 'atualizado') {
      return AUDITORIA_EVENTOS.FORNECEDOR_ATUALIZADO;
    }

    if (operacao === 'removido') {
      return AUDITORIA_EVENTOS.FORNECEDOR_REMOVIDO;
    }

    return AUDITORIA_EVENTOS.FORNECEDOR_CRIADO;
  }

  private getEventoAuditoriaPedidoCompra(operacao: 'criado' | 'atualizado' | 'removido') {
    if (operacao === 'atualizado') {
      return AUDITORIA_EVENTOS.PEDIDO_COMPRA_ATUALIZADO;
    }

    if (operacao === 'removido') {
      return AUDITORIA_EVENTOS.PEDIDO_COMPRA_REMOVIDO;
    }

    return AUDITORIA_EVENTOS.PEDIDO_COMPRA_CRIADO;
  }

  private getEventoAuditoriaItemPedidoCompra(operacao: 'criado' | 'atualizado' | 'removido') {
    if (operacao === 'atualizado') {
      return AUDITORIA_EVENTOS.ITEM_PEDIDO_COMPRA_ATUALIZADO;
    }

    if (operacao === 'removido') {
      return AUDITORIA_EVENTOS.ITEM_PEDIDO_COMPRA_REMOVIDO;
    }

    return AUDITORIA_EVENTOS.ITEM_PEDIDO_COMPRA_CRIADO;
  }
}
