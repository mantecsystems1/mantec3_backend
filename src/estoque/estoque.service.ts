import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { MovimentosEstoque, MovimentosEstoqueDocument } from './schemas/movimento-estoque.schema';
import { SaldoEstoque, SaldoEstoqueDocument } from './schemas/saldo-estoque.schema';
import { Produto, ProdutoDocument } from '../catalogo/produtos/schemas/produto.schema';
import { CreateMovimentoEstoqueDto } from './dto/create-movimento-estoque.dto';
import { UpdateMovimentoEstoqueDto } from './dto/update-movimento-estoque.dto';
import {
  MOVIMENTO_ESTOQUE_TIPO,
  calcularDisponibilidadeMovimentos,
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

  async create(createMovimentoEstoqueDto: CreateMovimentoEstoqueDto, actorId?: string, actorEmpresaId?: string, session?: ClientSession) {
    const empresaId = this.getEmpresaIdPermitida(createMovimentoEstoqueDto.empresaId, actorEmpresaId);
    const movimentoData = { ...createMovimentoEstoqueDto, empresaId };
    this.assertMovimentoValido(movimentoData.tipo, movimentoData.quantidade);
    return this.emTransacao(async (activeSession) => {
      await this.bloquearProdutos([movimentoData.produtoId], empresaId, activeSession);
      const saved = await new this.movimentosEstoqueModel(movimentoData).save({ session: activeSession });
      await this.atualizarSaldos([movimentoData.produtoId], empresaId, activeSession);
      if (actorId) await this.registrarAuditoriaEstoque(saved, actorId, 'criado');
      return saved;
    }, session);
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.movimentosEstoqueModel
      .find({ empresaId })
      .populate({ path: 'produtoId', select: 'nome codigoInterno precoVenda', match: { empresaId } })
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    let currentId = id;
    const visited = new Set<string>();
    while (!visited.has(currentId)) {
      visited.add(currentId);
      const current = await this.movimentosEstoqueModel.findOne({ _id: currentId, empresaId })
        .populate({ path: 'produtoId', select: 'nome codigoInterno precoVenda', match: { empresaId } }).exec();
      if (!current?.substituidoPorId) return current;
      currentId = current.substituidoPorId.toString();
    }
    throw new ConflictException('Historico de substituicoes inconsistente. Solicite revisao do estoque.');
  }

  async update(id: string, updateMovimentoEstoqueDto: UpdateMovimentoEstoqueDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaInformada(actorEmpresaId);
    this.getEmpresaIdPermitida(updateMovimentoEstoqueDto.empresaId, actorEmpresaId);
    return this.emTransacao(async (session) => {
      const current = await this.bloquearMovimento(id, actorEmpresaId, session);
      if (!current) return null;
      if (current.substituidoPorId) {
        const replacement = await this.movimentosEstoqueModel.findOne({ _id: current.substituidoPorId, empresaId: actorEmpresaId }).session(session).exec();
        if (replacement && !replacement.estornadoEm && this.correspondeAlteracao(replacement, updateMovimentoEstoqueDto)) return replacement;
        throw new ConflictException('Movimento ja substituido. Recarregue o registro antes de alterar.');
      }
      this.assertMovimentoEditavel(current);
      const nextData = { ...this.dadosMovimento(current), ...updateMovimentoEstoqueDto, empresaId: actorEmpresaId };
      this.assertMovimentoValido(nextData.tipo, nextData.quantidade);
      if (this.correspondeAlteracao(current, updateMovimentoEstoqueDto)) return current;
      const produtos = [current.produtoId.toString(), nextData.produtoId];
      await this.bloquearProdutos(produtos, actorEmpresaId, session);
      await this.acrescentarEstorno(current, session);
      const replacement = await new this.movimentosEstoqueModel({ ...nextData, substituiId: current._id }).save({ session });
      current.substituidoPorId = replacement._id as Types.ObjectId;
      await current.save({ session });
      await this.atualizarSaldos(produtos, actorEmpresaId, session);
      if (actorId) await this.registrarAuditoriaEstoque(replacement, actorId, 'atualizado');
      return replacement;
    });
  }

  async remove(id: string, actorId?: string, empresaId?: string, session?: ClientSession) {
    this.assertEmpresaInformada(empresaId);
    return this.emTransacao(async (activeSession) => {
      const current = await this.bloquearMovimento(id, empresaId, activeSession);
      if (!current) return null;
      if (current.estornadoEm) return current;
      this.assertMovimentoEditavel(current);
      const produtoId = current.produtoId.toString();
      await this.bloquearProdutos([produtoId], empresaId, activeSession);
      await this.acrescentarEstorno(current, activeSession);
      await current.save({ session: activeSession });
      await this.atualizarSaldos([produtoId], empresaId, activeSession);
      if (actorId) await this.registrarAuditoriaEstoque(current, actorId, 'removido');
      return current;
    }, session);
  }

  async getSaldoProduto(produtoId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    await this.assertProdutoDaEmpresa(produtoId, empresaId);
    const movimentos = await this.movimentosEstoqueModel.find({ produtoId, empresaId }).exec();
    const disponibilidade = calcularDisponibilidadeMovimentos(movimentos);

    return {
      produtoId,
      saldo: disponibilidade.saldoFisico,
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
        .populate({ path: 'produtoId', select: 'nome codigoInterno precoVenda empresaId', match: { empresaId } })
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

  /** Reuses an outer transaction; never starts a nested independent commit. */
  async emTransacao<T>(work: (session: ClientSession) => Promise<T>, session?: ClientSession): Promise<T> {
    const base = this.movimentosEstoqueModel.db.base as unknown as {
      transactionAsyncLocalStorage?: {
        getStore(): { session?: ClientSession } | undefined;
        run<R>(store: { session: ClientSession }, callback: () => R): R;
      };
    };
    const storage = base.transactionAsyncLocalStorage;
    const inherited = storage?.getStore()?.session;
    const active = session ?? inherited;
    if (active) {
      return storage && inherited !== active ? storage.run({ session: active }, () => work(active)) : work(active);
    }
    return this.movimentosEstoqueModel.db.transaction(work);
  }

  /** Replaces the active purchase-origin inputs atomically, preserving every ledger event. */
  async sincronizarEntradasOrigem(
    empresaId: string, origemTipo: string, origemId: string,
    itens: Array<{ produtoId: string; quantidade: number }>, actorId?: string,
  ) {
    this.assertEmpresaInformada(empresaId);
    return this.emTransacao(async (session) => {
      const current = await this.movimentosEstoqueModel.find({
        empresaId, origemTipo, origemId, tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
        estornadoEm: { $exists: false }, estornoDeId: { $exists: false },
      }).session(session).exec();
      const wanted = new Map<string, number>();
      for (const item of itens) {
        this.assertMovimentoValido(MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, item.quantidade);
        wanted.set(item.produtoId, (wanted.get(item.produtoId) ?? 0) + Number(item.quantidade));
      }
      const produtos = [...new Set([...current.map(item => item.produtoId.toString()), ...wanted.keys()])].sort();
      // Lock before reading the origin again: a competing sync must retry with a fresh snapshot.
      await this.bloquearProdutos(produtos, empresaId, session);
      const existing = new Map<string, number>();
      for (const item of current) existing.set(item.produtoId.toString(), (existing.get(item.produtoId.toString()) ?? 0) + item.quantidade);
      if (existing.size === wanted.size && [...wanted].every(([id, amount]) => existing.get(id) === amount)) {
        // Also repair a preexisting cache divergence from the authoritative ledger.
        await this.atualizarSaldos(produtos, empresaId, session);
        return current;
      }
      for (const item of current) {
        await this.acrescentarEstorno(item, session);
        await item.save({ session });
        if (actorId) await this.registrarAuditoriaEstoque(item, actorId, 'removido');
      }
      const replacements: MovimentosEstoqueDocument[] = [];
      for (const [produtoId, quantidade] of wanted) {
        const saved = await new this.movimentosEstoqueModel({
          empresaId, produtoId, quantidade, origemTipo, origemId, tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
        }).save({ session });
        replacements.push(saved);
        if (actorId) await this.registrarAuditoriaEstoque(saved, actorId, 'criado');
      }
      await this.atualizarSaldos(produtos, empresaId, session);
      return replacements;
    });
  }

  /** Read-only diagnostic: reports ledger/cache differences without changing either. */
  async diagnosticarSaldos(empresaId: string) {
    this.assertEmpresaInformada(empresaId);
    return this.emTransacao(async (session) => {
      const movimentos = await this.movimentosEstoqueModel.find({ empresaId }).session(session).lean().exec();
      const caches = await this.saldoEstoqueModel.find({ empresaId }).session(session).lean().exec();
      const ids = new Set([...movimentos.map(item => item.produtoId.toString()), ...caches.map(item => item.produtoId.toString())]);
      return [...ids].map(produtoId => {
        const ledger = calcularDisponibilidadeMovimentos(movimentos.filter(item => item.produtoId.toString() === produtoId));
        const cache = caches.find(item => item.produtoId.toString() === produtoId);
        return { produtoId, ledger, cache: cache ? { saldoFisico: cache.saldoFisico, reservado: cache.reservado, disponivel: cache.disponivel } : null,
          divergente: !cache || ledger.saldoFisico !== cache.saldoFisico || ledger.reservado !== cache.reservado || ledger.disponivel !== cache.disponivel };
      });
    });
  }

  private dadosMovimento(movimento: MovimentosEstoqueDocument): CreateMovimentoEstoqueDto {
    return { empresaId: movimento.empresaId.toString(), produtoId: movimento.produtoId.toString(),
      tipo: movimento.tipo, quantidade: movimento.quantidade, origemTipo: movimento.origemTipo, origemId: movimento.origemId.toString() };
  }

  private correspondeAlteracao(movimento: MovimentosEstoqueDocument, dto: UpdateMovimentoEstoqueDto) {
    const data = this.dadosMovimento(movimento);
    return (Object.keys(dto) as Array<keyof CreateMovimentoEstoqueDto>).every(key =>
      dto[key] === undefined || String(dto[key]) === String(data[key]));
  }

  private assertMovimentoEditavel(movimento: MovimentosEstoqueDocument) {
    if (movimento.estornoDeId || movimento.estornadoEm) {
      throw new ConflictException('Movimento ja estornado ou compensatorio. Recarregue o historico do estoque.');
    }
  }

  private bloquearMovimento(id: string, empresaId: string, session: ClientSession) {
    return this.movimentosEstoqueModel.findOneAndUpdate({ _id: id, empresaId }, { $inc: { __v: 1 } }, { new: true, session }).exec();
  }

  private async bloquearProdutos(produtos: string[], empresaId: string, session: ClientSession) {
    for (const produtoId of [...new Set(produtos)].sort()) {
      const produto = await this.produtoModel.findOneAndUpdate({ _id: produtoId, empresaId }, { $inc: { __v: 1 } }, { new: true, session }).select('_id').exec();
      if (!produto) throw new BadRequestException('Produto nao encontrado para a empresa do usuario.');
    }
  }

  private async acrescentarEstorno(current: MovimentosEstoqueDocument, session: ClientSession) {
    const tipo = current.tipo === MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS ? MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA
      : current.tipo === MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA ? MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS
      : getMovimentoEstoqueSinal(current.tipo) > 0 ? MOVIMENTO_ESTOQUE_TIPO.SAIDA : MOVIMENTO_ESTOQUE_TIPO.ENTRADA;
    const reverse = await new this.movimentosEstoqueModel({ ...this.dadosMovimento(current), tipo, estornoDeId: current._id }).save({ session });
    current.estornoId = reverse._id as Types.ObjectId;
    current.estornadoEm = new Date();
    return reverse;
  }

  private async atualizarSaldos(produtos: string[], empresaId: string, session: ClientSession) {
    for (const produtoId of [...new Set(produtos)].sort()) {
      const movimentos = await this.movimentosEstoqueModel.find({ empresaId, produtoId }).session(session).exec();
      const saldo = calcularDisponibilidadeMovimentos(movimentos);
      if (saldo.saldoFisico < 0 || saldo.reservado < 0 || saldo.disponivel < 0) {
        throw new BadRequestException('Operacao deixaria o estoque insuficiente ou reservas inconsistentes. Confira os movimentos vinculados.');
      }
      await this.saldoEstoqueModel.findOneAndUpdate({ empresaId, produtoId }, { $set: saldo }, { upsert: true, new: true, session }).exec();
    }
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
        estornoDeId: movimento.estornoDeId?.toString(),
        estornoId: movimento.estornoId?.toString(),
        substituiId: movimento.substituiId?.toString(),
        substituidoPorId: movimento.substituidoPorId?.toString(),
      },
    });
  }
}
