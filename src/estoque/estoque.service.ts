import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MovimentosEstoque, MovimentosEstoqueDocument } from './schemas/movimento-estoque.schema';
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
    @InjectModel(Produto.name) private produtoModel: Model<ProdutoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createMovimentoEstoqueDto: CreateMovimentoEstoqueDto, actorId?: string) {
    this.assertMovimentoValido(createMovimentoEstoqueDto.tipo, createMovimentoEstoqueDto.quantidade);
    await this.assertMovimentoNaoNegativaEstoque(createMovimentoEstoqueDto);

    const createdMovimento = new this.movimentosEstoqueModel(createMovimentoEstoqueDto);
    const saved = await createdMovimento.save();

    if (actorId) {
      await this.registrarAuditoriaEstoque(saved, actorId, 'criado');
    }

    return saved;
  }

  findAll() {
    return this.movimentosEstoqueModel
      .find()
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findOne(id: string) {
    return this.movimentosEstoqueModel
      .findById(id)
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  async update(id: string, updateMovimentoEstoqueDto: UpdateMovimentoEstoqueDto, actorId?: string) {
    if (updateMovimentoEstoqueDto.tipo || updateMovimentoEstoqueDto.quantidade !== undefined) {
      this.assertMovimentoValido(
        updateMovimentoEstoqueDto.tipo ?? '',
        updateMovimentoEstoqueDto.quantidade ?? 1,
        Boolean(updateMovimentoEstoqueDto.tipo),
      );
    }

    const current = await this.movimentosEstoqueModel.findById(id).exec();
    if (current) {
      const nextMovimento = {
        produtoId: updateMovimentoEstoqueDto.produtoId ?? current.produtoId?.toString(),
        tipo: updateMovimentoEstoqueDto.tipo ?? current.tipo,
        quantidade: updateMovimentoEstoqueDto.quantidade ?? current.quantidade,
      };
      await this.assertMovimentoNaoNegativaEstoque(nextMovimento, current);
    }

    const updated = await this.movimentosEstoqueModel.findByIdAndUpdate(id, updateMovimentoEstoqueDto, { new: true }).exec();

    if (actorId && updated) {
      await this.registrarAuditoriaEstoque(updated, actorId, 'atualizado');
    }

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const removed = await this.movimentosEstoqueModel.findByIdAndDelete(id).exec();

    if (actorId && removed) {
      await this.registrarAuditoriaEstoque(removed, actorId, 'removido');
    }

    return removed;
  }

  async getSaldoProduto(produtoId: string) {
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId }).exec();
    const saldo = calcularSaldoMovimentos(movimentos);
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      saldo,
      ...disponibilidade,
      totalMovimentos: movimentos.length,
    };
  }

  async getDisponibilidadeProduto(produtoId: string) {
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId }).exec();
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      ...disponibilidade,
      totalMovimentos: movimentos.length,
    };
  }

  async getDisponibilidadeProdutos() {
    const [produtos, movimentos] = await Promise.all([
      this.produtoModel.find().lean().exec(),
      this.movimentosEstoqueModel
        .find()
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

  async assertSaldoDisponivel(produtoId: string, quantidade: number, saldoAdicional = 0) {
    this.assertQuantidadeValida(quantidade);

    const { disponivel } = await this.getDisponibilidadeProduto(produtoId);
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

    const movimentos = await this.movimentosEstoqueModel.find({ produtoId }).exec();
    const movimentosConsiderados = movimentoAtual
      ? movimentos.filter((item) => String(item._id) !== String(movimentoAtual._id))
      : movimentos;
    const { disponivel } = calcularDisponibilidadeMovimentos(movimentosConsiderados);

    if (disponivel < quantidade) {
      throw new BadRequestException(`Saldo insuficiente para movimentar estoque. Disponivel: ${disponivel}. Solicitado: ${quantidade}.`);
    }
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
