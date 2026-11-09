import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fornecedor, FornecedorDocument } from './schemas/fornecedor.schema';
import { PedidosCompra, PedidosCompraDocument } from './schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraDocument } from './schemas/itens-pedido-compra.schema';
import { EstoqueService } from '../estoque/estoque.service';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { CreatePedidoCompraDto } from './dto/create-pedido-compra.dto';
import { UpdatePedidoCompraDto } from './dto/update-pedido-compra.dto';
import { CreateItensPedidoCompraDto } from './dto/create-itens-pedido-compra.dto';
import { UpdateItensPedidoCompraDto } from './dto/update-itens-pedido-compra.dto';
import { MOVIMENTO_ESTOQUE_ORIGEM } from '../estoque/movimento-estoque.types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { FinanceiroAdmService } from '../financeiro/financeiro-adm/financeiro-adm.service';
import { centavosParaDecimal128, dinheiroParaCentavos } from '../financeiro/financeiro-adm/financeiro-adm.types';

const PEDIDO_COMPRA_STATUS_RECEBIDO = 'recebido';

@Injectable()
export class ComprasService {
  constructor(
    @InjectModel(Fornecedor.name) private fornecedorModel: Model<FornecedorDocument>,
    @InjectModel(PedidosCompra.name) private pedidosCompraModel: Model<PedidosCompraDocument>,
    @InjectModel(ItensPedidoCompra.name) private itensPedidoCompraModel: Model<ItensPedidoCompraDocument>,
    private readonly estoqueService: EstoqueService,
    private readonly auditoriaService: AuditoriaService,
    private readonly financeiroAdmService: FinanceiroAdmService,
  ) { }

  // Fornecedor CRUD
  async createFornecedor(createFornecedorDto: CreateFornecedorDto, actorId?: string, actorEmpresaId?: string) {
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
      if (err?.code === 11000) {
        throw new BadRequestException('Fornecedor com este CNPJ já existe');
      }

      throw err;
    }

  }

  findAllFornecedores(empresaId?: string) {
    return this.fornecedorModel.find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } })).exec();
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
    const fornecedor = await this.fornecedorModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { ativo: false }, { new: true })
      .exec();

    if (actorId && fornecedor) {
      await this.registrarAuditoriaFornecedor(fornecedor, actorId, 'removido');
    }

    return fornecedor;
  }

  // PedidosCompra CRUD
  async createPedidoCompra(createPedidoCompraDto: CreatePedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    return this.estoqueService.emTransacao(() => this.createPedidoCompraAtomic(createPedidoCompraDto, actorId, actorEmpresaId));
  }

  private async createPedidoCompraAtomic(createPedidoCompraDto: CreatePedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    try {
      const { itens = [], ...pedidoDto } = createPedidoCompraDto;
      this.assertEmpresaPermitida(pedidoDto.empresaId, actorEmpresaId);
      await this.assertFornecedorPertenceEmpresa(pedidoDto.fornecedorId, actorEmpresaId);

      // Cria o pedido
      const pedido = await this.pedidosCompraModel.create(pedidoDto);

      // Salva os itens
      if (Array.isArray(itens) && itens.length > 0) {
        for (const item of itens) {
          await this.createItensPedidoCompra({
            pedidoCompraId: pedido._id.toString(),
            produtoId: String(item.produtoId),
            quantidade: Number(item.quantidade),
            valorUnitario: String(item.valorUnitario),
          }, actorId, actorEmpresaId, false);
        }
      }

      await this.sincronizarEntradaEstoquePedido(pedido._id.toString(), pedidoDto.status);

      if (actorId) {
        await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'criado');
      }

      await this.sincronizarFinanceiroPedidoCompraPorId(pedido._id.toString(), actorId, actorEmpresaId);

      // Retorna o pedido completo com itens
      return await this.findOnePedidoCompra(pedido._id.toString(), actorEmpresaId);
    } catch (error) {
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
    return this.estoqueService.emTransacao(() => this.updatePedidoCompraAtomic(id, updatePedidoCompraDto, actorId, actorEmpresaId));
  }

  private async updatePedidoCompraAtomic(id: string, updatePedidoCompraDto: UpdatePedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    try {
      const { itens, ...pedidoDto } = updatePedidoCompraDto;
      if (pedidoDto.empresaId) {
        this.assertEmpresaPermitida(pedidoDto.empresaId, actorEmpresaId);
      }
      if (pedidoDto.fornecedorId) {
        await this.assertFornecedorPertenceEmpresa(pedidoDto.fornecedorId, actorEmpresaId);
      }

      if (this.isStatusCancelado(pedidoDto.status)) {
        const pedidoAtual = await this.pedidosCompraModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
        if (!pedidoAtual) {
          throw new NotFoundException('Pedido de compra nao encontrado');
        }

        await this.financeiroAdmService.cancelarTituloPorOrigem(
          pedidoAtual.empresaId.toString(),
          'pedido_compra',
          id,
          actorId,
          actorEmpresaId,
        );
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
            }, actorId, actorEmpresaId, false);
          }
        }
      }

      await this.sincronizarEntradaEstoquePedido(id, pedido.status);

      if (actorId) {
        await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'atualizado');
      }

      await this.sincronizarFinanceiroPedidoCompraPorId(id, actorId, actorEmpresaId);

      return await this.findOnePedidoCompra(id, actorEmpresaId);
    } catch (error) {
      throw error;
    }
  }

  async removePedidoCompra(id: string, actorId?: string, actorEmpresaId?: string) {
    return this.estoqueService.emTransacao(() => this.removePedidoCompraAtomic(id, actorId, actorEmpresaId));
  }

  private async removePedidoCompraAtomic(id: string, actorId?: string, actorEmpresaId?: string) {
    const pedido = await this.pedidosCompraModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: id })).exec();
    if (!pedido) {
      throw new NotFoundException('Pedido de compra nao encontrado');
    }

    await this.financeiroAdmService.cancelarTituloPorOrigem(
      pedido.empresaId.toString(),
      'pedido_compra',
      id,
      actorId,
      actorEmpresaId,
    );

    await this.removerEntradasEstoquePedido(id);
    const removed = await this.pedidosCompraModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { status: 'cancelado' }, { new: true })
      .exec();

    if (actorId && pedido) {
      await this.registrarAuditoriaPedidoCompra(pedido, actorId, 'removido');
    }

    return removed;
  }

  // ItensPedidoCompra CRUD
  async createItensPedidoCompra(
    createItensPedidoCompraDto: CreateItensPedidoCompraDto,
    actorId?: string,
    actorEmpresaId?: string,
    syncFinanceiro = true,
  ) {
    return this.estoqueService.emTransacao(() => this.createItensPedidoCompraAtomic(createItensPedidoCompraDto, actorId, actorEmpresaId, syncFinanceiro));
  }

  private async createItensPedidoCompraAtomic(
    createItensPedidoCompraDto: CreateItensPedidoCompraDto,
    actorId?: string,
    actorEmpresaId?: string,
    syncFinanceiro = true,
  ) {
    try {
      await this.assertPedidoCompraPertenceEmpresa(createItensPedidoCompraDto.pedidoCompraId, actorEmpresaId);

      const itemData: any = { ...createItensPedidoCompraDto };
      if (
        createItensPedidoCompraDto.valorUnitario !== undefined &&
        createItensPedidoCompraDto.valorUnitario !== null &&
        createItensPedidoCompraDto.valorUnitario !== ''
      ) {
        try {
          itemData.valorUnitario = centavosParaDecimal128(
            this.parseValorPositivoCentavos(createItensPedidoCompraDto.valorUnitario, 'valorUnitario'),
          );
        } catch (err) {
          throw new BadRequestException('valorUnitario inválido');
        }
      }
      const createdItem = new this.itensPedidoCompraModel(itemData);
      const saved = await createdItem.save();

      if (actorId) {
        await this.registrarAuditoriaItemPedidoCompra(saved, actorId, 'criado');
      }

      if (syncFinanceiro) {
        const pedido = await this.pedidosCompraModel.findById(createItensPedidoCompraDto.pedidoCompraId).lean().exec();
        if (pedido) await this.sincronizarEntradaEstoquePedido(createItensPedidoCompraDto.pedidoCompraId, pedido.status);
        await this.sincronizarFinanceiroPedidoCompraPorId(createItensPedidoCompraDto.pedidoCompraId, actorId, actorEmpresaId);
      }

      return saved;
    } catch (error) {
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
    return this.estoqueService.emTransacao(() => this.updateItensPedidoCompraAtomic(id, updateItensPedidoCompraDto, actorId, actorEmpresaId));
  }

  private async updateItensPedidoCompraAtomic(id: string, updateItensPedidoCompraDto: UpdateItensPedidoCompraDto, actorId?: string, actorEmpresaId?: string) {
    const existing = await this.itensPedidoCompraModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Item de pedido de compra nao encontrado');
    }
    const pedidoCompraIdAnterior = existing.pedidoCompraId.toString();

    await this.assertPedidoCompraPertenceEmpresa(
      (updateItensPedidoCompraDto.pedidoCompraId ?? existing.pedidoCompraId).toString(),
      actorEmpresaId,
    );

    const updateData: any = { ...updateItensPedidoCompraDto };
    if (updateItensPedidoCompraDto.valorUnitario) {
      updateData.valorUnitario = centavosParaDecimal128(
        this.parseValorPositivoCentavos(updateItensPedidoCompraDto.valorUnitario, 'valorUnitario'),
      );
    }
    const item = await this.itensPedidoCompraModel.findByIdAndUpdate(id, updateData, { new: true }).exec();

    if (actorId && item) {
      await this.registrarAuditoriaItemPedidoCompra(item, actorId, 'atualizado');
    }

    if (item) {
      await this.sincronizarEstoquePedidoPorId(pedidoCompraIdAnterior);
      await this.sincronizarFinanceiroPedidoCompraPorId(pedidoCompraIdAnterior, actorId, actorEmpresaId);
      const pedidoCompraIdAtual = item.pedidoCompraId.toString();
      if (pedidoCompraIdAtual !== pedidoCompraIdAnterior) {
        await this.sincronizarEstoquePedidoPorId(pedidoCompraIdAtual);
        await this.sincronizarFinanceiroPedidoCompraPorId(pedidoCompraIdAtual, actorId, actorEmpresaId);
      }
    }

    return item;
  }

  async removeItensPedidoCompra(id: string, actorId?: string, actorEmpresaId?: string) {
    return this.estoqueService.emTransacao(() => this.removeItensPedidoCompraAtomic(id, actorId, actorEmpresaId));
  }

  private async removeItensPedidoCompraAtomic(id: string, actorId?: string, actorEmpresaId?: string) {
    const existing = await this.itensPedidoCompraModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Item de pedido de compra nao encontrado');
    }

    await this.assertPedidoCompraPertenceEmpresa(existing.pedidoCompraId.toString(), actorEmpresaId);

    const item = await this.itensPedidoCompraModel.findByIdAndDelete(id).exec();

    if (actorId && item) {
      await this.registrarAuditoriaItemPedidoCompra(item, actorId, 'removido');
    }

    await this.sincronizarEstoquePedidoPorId(existing.pedidoCompraId.toString());
    await this.sincronizarFinanceiroPedidoCompraPorId(existing.pedidoCompraId.toString(), actorId, actorEmpresaId);

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

  private async sincronizarEstoquePedidoPorId(id: string) {
    const pedido = await this.pedidosCompraModel.findById(id).lean().exec();
    if (pedido) await this.sincronizarEntradaEstoquePedido(id, pedido.status);
  }

  private async sincronizarEntradaEstoquePedido(pedidoCompraId: string, status?: string) {
    const pedido = await this.pedidosCompraModel.findById(pedidoCompraId).lean().exec();
    if (!pedido) {
      throw new BadRequestException('Pedido de compra nao encontrado para entrada no estoque.');
    }

    const itens = status === PEDIDO_COMPRA_STATUS_RECEBIDO
      ? await this.itensPedidoCompraModel.find({ pedidoCompraId }).lean().exec() : [];
    await this.estoqueService.sincronizarEntradasOrigem(
      pedido.empresaId.toString(), MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA, pedidoCompraId,
      itens.map(item => ({ produtoId: item.produtoId.toString(), quantidade: Number(item.quantidade) })),
    );
  }

  private async removerEntradasEstoquePedido(pedidoCompraId: string) {
    if (!Types.ObjectId.isValid(pedidoCompraId)) {
      return;
    }

    await this.sincronizarEntradaEstoquePedido(pedidoCompraId, 'cancelado');
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private isStatusCancelado(status?: string) {
    const normalized = String(status ?? '').trim().toLowerCase();
    return ['cancelado', 'cancelada', 'cancelled', 'canceled'].includes(normalized);
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

  private async sincronizarFinanceiroPedidoCompraPorId(pedidoCompraId: string, actorId?: string, actorEmpresaId?: string) {
    const pedido = await this.pedidosCompraModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: pedidoCompraId })).exec();
    if (!pedido) {
      return;
    }

    const total = await this.calcularTotalPedidoCompra(pedidoCompraId);
    await this.financeiroAdmService.sincronizarTituloCompraPedido(pedido, total, actorId, actorEmpresaId);
  }

  private async calcularTotalPedidoCompra(pedidoCompraId: string) {
    const itens = await this.itensPedidoCompraModel.find({ pedidoCompraId }).lean().exec();

    return itens.reduce((sum, item: any) => {
      const decimalValue = item.valorUnitario?.$numberDecimal ?? item.valorUnitario?.toString?.() ?? '0';
      return sum + Number(decimalValue) * Number(item.quantidade ?? 0);
    }, 0);
  }

  private parseValorPositivoCentavos(value: unknown, campo: string) {
    const centavos = dinheiroParaCentavos(value);
    if (!Number.isFinite(centavos) || centavos < 0) {
      throw new BadRequestException(`${campo} invalido`);
    }

    return centavos;
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
