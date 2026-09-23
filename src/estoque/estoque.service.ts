import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MovimentosEstoque, MovimentosEstoqueDocument } from './schemas/movimento-estoque.schema';
import { SaldoEstoque, SaldoEstoqueDocument } from './schemas/saldo-estoque.schema';
import { Produto, ProdutoDocument } from '../catalogo/produtos/schemas/produto.schema';
import { CreateMovimentoEstoqueDto } from './dto/create-movimento-estoque.dto';
import { UpdateMovimentoEstoqueDto } from './dto/update-movimento-estoque.dto';
import {
  MOVIMENTO_ESTOQUE_TIPO,
  calcularDisponibilidadeMovimentos,
  calcularSaldoMovimentos,
  getMovimentoEstoqueSinal,
  isMovimentoEstoqueTipo,
} from './movimento-estoque.types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';

export interface ProdutoDisponibilidadeResumo {
  produtoId: string;
  produto: unknown;
  saldoFisico: number;
  reservado: number;
  disponivel: number;
  totalMovimentos: number;
}

@Injectable()
export class EstoqueService {
  constructor(
    @InjectModel(MovimentosEstoque.name) private movimentosEstoqueModel: Model<MovimentosEstoqueDocument>,
    @InjectModel(SaldoEstoque.name) private saldoEstoqueModel: Model<SaldoEstoqueDocument>,
    @InjectModel(Produto.name) private produtoModel: Model<ProdutoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createMovimentoEstoqueDto: CreateMovimentoEstoqueDto, actorId?: string, actorEmpresaId?: string) {
    const empresaId = this.getEmpresaIdPermitida(createMovimentoEstoqueDto.empresaId, actorEmpresaId);
    const movimentoData = { ...createMovimentoEstoqueDto, empresaId };
    await this.assertProdutoDaEmpresa(movimentoData.produtoId, empresaId);
    this.assertMovimentoValido(movimentoData.tipo, movimentoData.quantidade);
    await this.aplicarMovimentoSaldoAtomico(movimentoData);

    const createdMovimento = new this.movimentosEstoqueModel(movimentoData);
    let saved: MovimentosEstoqueDocument;
    try {
      saved = await createdMovimento.save();
    } catch (error) {
      await this.reverterMovimentoSaldoAtomico(movimentoData).catch(() => undefined);
      throw error;
    }

    if (actorId) {
      await this.registrarAuditoriaEstoque(saved, actorId, 'criado');
    }

    return saved;
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.movimentosEstoqueModel
      .find({ empresaId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.movimentosEstoqueModel
      .findOne({ _id: id, empresaId })
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async update(id: string, updateMovimentoEstoqueDto: UpdateMovimentoEstoqueDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaInformada(actorEmpresaId);
    if (updateMovimentoEstoqueDto.tipo || updateMovimentoEstoqueDto.quantidade !== undefined) {
      this.assertMovimentoValido(
        updateMovimentoEstoqueDto.tipo ?? '',
        updateMovimentoEstoqueDto.quantidade ?? 1,
        Boolean(updateMovimentoEstoqueDto.tipo),
      );
    }

    const current = await this.movimentosEstoqueModel.findOne({ _id: id, empresaId: actorEmpresaId }).exec();
    if (current) {
      const empresaId = this.getEmpresaIdPermitida(updateMovimentoEstoqueDto.empresaId, actorEmpresaId);
      const nextMovimento = {
        produtoId: updateMovimentoEstoqueDto.produtoId ?? current.produtoId?.toString(),
        tipo: updateMovimentoEstoqueDto.tipo ?? current.tipo,
        quantidade: updateMovimentoEstoqueDto.quantidade ?? current.quantidade,
        empresaId,
      };
      await this.assertProdutoDaEmpresa(nextMovimento.produtoId, empresaId);
      await this.assertMovimentoNaoNegativaEstoque(nextMovimento, current);
    }

    const updated = await this.movimentosEstoqueModel
      .findOneAndUpdate({ _id: id, empresaId: actorEmpresaId }, { ...updateMovimentoEstoqueDto, empresaId: actorEmpresaId }, { new: true })
      .exec();

    if (actorId && updated) {
      await this.registrarAuditoriaEstoque(updated, actorId, 'atualizado');
    }

    return updated;
  }

  async remove(id: string, actorId?: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const removed = await this.movimentosEstoqueModel.findOneAndDelete({ _id: id, empresaId }).exec();

    if (actorId && removed) {
      await this.registrarAuditoriaEstoque(removed, actorId, 'removido');
    }

    return removed;
  }

  async getSaldoProduto(produtoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    await this.assertProdutoDaEmpresa(produtoId, empresaId);
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId, empresaId }).exec();
    const saldo = calcularSaldoMovimentos(movimentos);
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      saldo,
      ...disponibilidade,
      totalMovimentos: movimentos.length,
    };
  }

  async getDisponibilidadeProduto(produtoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    await this.assertProdutoDaEmpresa(produtoId, empresaId);
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId, empresaId }).exec();
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      ...disponibilidade,
      totalMovimentos: movimentos.length,
    };
  }

  async getDisponibilidadeProdutos(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const [produtos, movimentos] = await Promise.all([
      this.produtoModel.find({ empresaId }).lean().exec(),
      this.movimentosEstoqueModel
        .find({ empresaId })
        .populate('produtoId', 'nome codigoInterno precoVenda empresaId')
        .exec(),
    ]);

    const movimentosPorProduto = new Map<string, MovimentosEstoqueDocument[]>();
    for (const movimento of movimentos) {
      const produtoId = this.getObjectIdString(movimento.produtoId);
      if (!produtoId) continue;

      const lista = movimentosPorProduto.get(produtoId) ?? [];
      lista.push(movimento);
      movimentosPorProduto.set(produtoId, lista);
    }

    const disponibilidadePorProduto: ProdutoDisponibilidadeResumo[] = produtos.map((produto) => {
      const produtoId = produto._id.toString();
      const produtoMovimentos = movimentosPorProduto.get(produtoId) ?? [];
      const disponibilidade = calcularDisponibilidadeMovimentos(produtoMovimentos);

      return {
        produtoId,
        produto,
        ...disponibilidade,
        totalMovimentos: produtoMovimentos.length,
      };
    });

    for (const [produtoId, produtoMovimentos] of movimentosPorProduto.entries()) {
      if (disponibilidadePorProduto.some((item) => item.produtoId === produtoId)) {
        continue;
      }

      const disponibilidade = calcularDisponibilidadeMovimentos(produtoMovimentos);
      const produto = produtoMovimentos.find((movimento) => movimento.produtoId)?.produtoId;

      disponibilidadePorProduto.push({
        produtoId,
        produto,
        ...disponibilidade,
        totalMovimentos: produtoMovimentos.length,
      });
    }

    return disponibilidadePorProduto;
  }

  async assertSaldoDisponivel(produtoId: string, quantidade: number, saldoAdicional = 0, empresaId?: string) {
    this.assertQuantidadeValida(quantidade);

    const { disponivel } = empresaId
      ? await this.getDisponibilidadeProduto(produtoId, empresaId)
      : await this.getDisponibilidadeProdutoInterno(produtoId);
    const saldoDisponivel = disponivel + Number(saldoAdicional || 0);
    if (saldoDisponivel < Number(quantidade)) {
      throw new BadRequestException(`Saldo insuficiente para o produto. Disponivel: ${saldoDisponivel}. Solicitado: ${quantidade}.`);
    }

    return saldoDisponivel;
  }

  private assertMovimentoValido(tipo: string, quantidade: number, validateTipo = true) {
    if (validateTipo && !isMovimentoEstoqueTipo(tipo)) {
      throw new BadRequestException(`Tipo de movimento de estoque invalido: ${tipo}`);
    }

    this.assertQuantidadeValida(quantidade);
  }

  private assertQuantidadeValida(quantidade: number) {
    if (!Number.isFinite(Number(quantidade)) || Number(quantidade) <= 0) {
      throw new BadRequestException('Quantidade do movimento de estoque deve ser maior que zero.');
    }
  }

  private async assertMovimentoNaoNegativaEstoque(
    movimento: Pick<CreateMovimentoEstoqueDto, 'produtoId' | 'tipo' | 'quantidade'>,
    movimentoAtual?: MovimentosEstoqueDocument,
  ) {
    const tipo = movimento.tipo;
    const quantidade = Number(movimento.quantidade || 0);

    if (!this.deveValidarSaldo(tipo)) {
      return;
    }

    const produtoId = this.getObjectIdString(movimento.produtoId);
    if (!produtoId) {
      return;
    }

    const filtro: Record<string, unknown> = { produtoId };
    if ('empresaId' in movimento && movimento.empresaId) {
      filtro.empresaId = movimento.empresaId;
    }
    const movimentos = await this.movimentosEstoqueModel.find(filtro).exec();
    const movimentosConsiderados = movimentoAtual
      ? movimentos.filter((item) => String(item._id) !== String(movimentoAtual._id))
      : movimentos;
    const { disponivel } = calcularDisponibilidadeMovimentos(movimentosConsiderados);

    if (disponivel < quantidade) {
      throw new BadRequestException(`Saldo insuficiente para movimentar estoque. Disponivel: ${disponivel}. Solicitado: ${quantidade}.`);
    }
  }

  private async aplicarMovimentoSaldoAtomico(movimento: Pick<CreateMovimentoEstoqueDto, 'produtoId' | 'tipo' | 'quantidade'> & { empresaId?: string }) {
    const produtoId = this.getObjectIdString(movimento.produtoId);
    const empresaId = movimento.empresaId;
    if (!produtoId || !empresaId) return;

    await this.ensureSaldoEstoque(produtoId, empresaId);
    const quantidade = Number(movimento.quantidade || 0);
    const { filtro, inc } = this.operacaoSaldo(movimento.tipo, quantidade);
    const saldo = await this.saldoEstoqueModel.findOneAndUpdate(
      { empresaId, produtoId, ...filtro },
      { $inc: inc },
      { new: true },
    ).exec();

    if (!saldo) {
      throw new BadRequestException(`Saldo insuficiente para movimentar estoque. Solicitado: ${quantidade}.`);
    }
  }

  private async reverterMovimentoSaldoAtomico(movimento: Pick<CreateMovimentoEstoqueDto, 'produtoId' | 'tipo' | 'quantidade'> & { empresaId?: string }) {
    const produtoId = this.getObjectIdString(movimento.produtoId);
    const empresaId = movimento.empresaId;
    if (!produtoId || !empresaId) return;
    const quantidade = Number(movimento.quantidade || 0);
    const { inc } = this.operacaoSaldo(movimento.tipo, quantidade);
    await this.saldoEstoqueModel.findOneAndUpdate(
      { empresaId, produtoId },
      {
        $inc: {
          saldoFisico: -Number(inc.saldoFisico ?? 0),
          reservado: -Number(inc.reservado ?? 0),
          disponivel: -Number(inc.disponivel ?? 0),
        },
      },
    ).exec();
  }

  private async ensureSaldoEstoque(produtoId: string, empresaId: string) {
    const existing = await this.saldoEstoqueModel.exists({ empresaId, produtoId }).exec();
    if (existing) return;

    const movimentos = await this.movimentosEstoqueModel.find({ empresaId, produtoId }).exec();
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);
    try {
      await this.saldoEstoqueModel.findOneAndUpdate(
        { empresaId, produtoId },
        { $setOnInsert: { empresaId, produtoId, ...disponibilidade } },
        { upsert: true, new: true },
      ).exec();
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
    }
  }

  private operacaoSaldo(tipo: string, quantidade: number) {
    if (tipo === MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS) {
      return {
        filtro: { disponivel: { $gte: quantidade } },
        inc: { reservado: quantidade, disponivel: -quantidade },
      };
    }

    if (tipo === MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA) {
      return {
        filtro: { reservado: { $gte: quantidade } },
        inc: { reservado: -quantidade, disponivel: quantidade },
      };
    }

    if ([MOVIMENTO_ESTOQUE_TIPO.ENTRADA, MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS, MOVIMENTO_ESTOQUE_TIPO.TROCA_GARANTIA].includes(tipo as never)) {
      return {
        filtro: {},
        inc: { saldoFisico: quantidade, disponivel: quantidade },
      };
    }

    return {
      filtro: { saldoFisico: { $gte: quantidade }, disponivel: { $gte: quantidade } },
      inc: { saldoFisico: -quantidade, disponivel: -quantidade },
    };
  }

  private isDuplicateKeyError(error: unknown) {
    const e = error as { code?: number };
    return e?.code === 11000;
  }

  private deveValidarSaldo(tipo: string) {
    if (tipo === MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA) {
      return false;
    }

    return getMovimentoEstoqueSinal(tipo) < 0;
  }

  private getObjectIdString(value: unknown) {
    if (!value) return undefined;
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record._id instanceof Types.ObjectId) return record._id.toString();
      if (typeof record._id === 'string') return record._id;
      if (typeof record.id === 'string') return record.id;
    }

    return undefined;
  }

  private async getDisponibilidadeProdutoInterno(produtoId: string) {
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId }).exec();
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      ...disponibilidade,
      totalMovimentos: movimentos.length,
    };
  }

  private async assertProdutoDaEmpresa(produtoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const produto = await this.produtoModel.findOne({ _id: produtoId, empresaId }).select('_id').lean().exec();
    if (!produto) {
      throw new BadRequestException('Produto nao encontrado para a empresa do usuario.');
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
      throw new UnauthorizedException('Empresa do movimento nao informada.');
    }

    return String(inputEmpresaId);
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }

  private async registrarAuditoriaEstoque(
    movimento: MovimentosEstoqueDocument,
    actorId: string,
    operacao: 'criado' | 'atualizado' | 'removido',
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: movimento.empresaId,
      usuarioId: actorId,
      tipoEvento: AUDITORIA_EVENTOS.ESTOQUE_AJUSTADO,
      entidade: AUDITORIA_ENTIDADES.ESTOQUE,
      entidadeId: movimento._id as Types.ObjectId,
      dados: {
        operacao,
        produtoId: movimento.produtoId?.toString(),
        tipo: movimento.tipo,
        quantidade: movimento.quantidade,
        origemTipo: movimento.origemTipo,
        origemId: movimento.origemId?.toString(),
      },
    });
  }
}
