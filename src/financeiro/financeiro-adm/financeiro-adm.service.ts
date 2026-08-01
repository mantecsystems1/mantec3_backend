import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { CreateContaFinanceiraDto } from './dto/create-conta-financeira.dto';
import { UpdateContaFinanceiraDto } from './dto/update-conta-financeira.dto';
import { CreateCategoriaFinanceiraDto } from './dto/create-categoria-financeira.dto';
import { UpdateCategoriaFinanceiraDto } from './dto/update-categoria-financeira.dto';
import { CreateTituloFinanceiroDto } from './dto/create-titulo-financeiro.dto';
import { UpdateTituloFinanceiroDto } from './dto/update-titulo-financeiro.dto';
import { BaixarTituloFinanceiroDto } from './dto/baixar-titulo-financeiro.dto';
import { CreateMovimentoCaixaDto } from './dto/create-movimento-caixa.dto';
import { EstornarMovimentoCaixaDto } from './dto/estornar-movimento-caixa.dto';
import { CreateRecorrenciaFinanceiraDto } from './dto/create-recorrencia-financeira.dto';
import { UpdateRecorrenciaFinanceiraDto } from './dto/update-recorrencia-financeira.dto';
import { GerarRecorrenciasFinanceirasDto } from './dto/gerar-recorrencias-financeiras.dto';
import { ContaFinanceira, ContaFinanceiraDocument } from './schemas/conta-financeira.schema';
import { CategoriaFinanceira, CategoriaFinanceiraDocument } from './schemas/categoria-financeira.schema';
import { TituloFinanceiro, TituloFinanceiroDocument } from './schemas/titulo-financeiro.schema';
import { MovimentoCaixa, MovimentoCaixaDocument } from './schemas/movimento-caixa.schema';
import { RecorrenciaFinanceira, RecorrenciaFinanceiraDocument } from './schemas/recorrencia-financeira.schema';
import {
  CATEGORIA_FINANCEIRA_CLASSIFICACAO,
  MOVIMENTO_CAIXA_STATUS,
  MOVIMENTO_CAIXA_TIPO,
  RecorrenciaFinanceiraFrequencia,
  RECORRENCIA_FINANCEIRA_FREQUENCIA,
  RECORRENCIA_FINANCEIRA_STATUS,
  TITULO_FINANCEIRO_STATUS,
  TITULO_FINANCEIRO_TIPO,
  avancarCompetencia,
  calcularStatusTitulo,
  centavosParaDecimal128,
  centavosParaString,
  dinheiroParaCentavos,
  tituloTipoParaCategoriaTipo,
  tituloTipoParaMovimentoTipo,
  vencimentoDaCompetencia,
} from './financeiro-adm.types';

type FiltrosFinanceiros = Record<string, string | undefined>;

interface RegistrarMovimentoInput {
  empresaId: string | Types.ObjectId;
  contaId: string | Types.ObjectId;
  categoriaId: string | Types.ObjectId;
  tituloId?: string | Types.ObjectId;
  tipo: string;
  descricao: string;
  valorCentavos: number;
  dataMovimento: Date;
  formaPagamento: string;
  origemTipo?: string;
  origemId?: string | Types.ObjectId;
  observacoes?: string;
}

@Injectable()
export class FinanceiroAdmService {
  constructor(
    @InjectModel(ContaFinanceira.name) private contaModel: Model<ContaFinanceiraDocument>,
    @InjectModel(CategoriaFinanceira.name) private categoriaModel: Model<CategoriaFinanceiraDocument>,
    @InjectModel(TituloFinanceiro.name) private tituloModel: Model<TituloFinanceiroDocument>,
    @InjectModel(MovimentoCaixa.name) private movimentoModel: Model<MovimentoCaixaDocument>,
    @InjectModel(RecorrenciaFinanceira.name) private recorrenciaModel: Model<RecorrenciaFinanceiraDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async createConta(dto: CreateContaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    await this.assertContaNomeUnico(dto.empresaId, dto.nome);

    const saldoInicialCentavos = this.parseValor(dto.saldoInicial ?? '0', 'saldoInicial', false);
    const conta = await this.contaModel.create({
      ...dto,
      empresaId: this.toObjectId(dto.empresaId, 'empresaId'),
      saldoInicial: centavosParaDecimal128(saldoInicialCentavos),
      saldoAtual: centavosParaDecimal128(saldoInicialCentavos),
      moeda: dto.moeda ?? 'BRL',
      ativo: dto.ativo ?? true,
    });

    await this.registrarAuditoria(conta, actorId, AUDITORIA_EVENTOS.CONTA_FINANCEIRA_CRIADA, AUDITORIA_ENTIDADES.CONTA_FINANCEIRA, {
      nome: conta.nome,
      tipo: conta.tipo,
    });

    return conta;
  }

  findAllContas(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query: Record<string, unknown> = this.getEmpresaQuery(empresaId);
    this.aplicarFiltroAtivo(query, filtros.ativo);

    return this.contaModel.find(query).exec();
  }

  async findOneConta(id: string, empresaId?: string) {
    return this.getContaDaEmpresa(id, empresaId);
  }

  async updateConta(id: string, dto: UpdateContaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const contaAtual = await this.getContaDaEmpresa(id, actorEmpresaId);
    if (dto.nome && dto.nome !== contaAtual.nome) {
      await this.assertContaNomeUnico(actorEmpresaId ?? contaAtual.empresaId.toString(), dto.nome, id);
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.empresaId) {
      updateData.empresaId = this.toObjectId(dto.empresaId, 'empresaId');
    }
    if (dto.saldoInicial !== undefined) {
      const temMovimento = await this.movimentoModel.exists({ contaId: id }).exec();
      if (temMovimento) {
        throw new BadRequestException('Saldo inicial nao pode ser alterado depois de movimentacoes.');
      }

      const saldoInicialCentavos = this.parseValor(dto.saldoInicial, 'saldoInicial', false);
      updateData.saldoInicial = centavosParaDecimal128(saldoInicialCentavos);
      updateData.saldoAtual = centavosParaDecimal128(saldoInicialCentavos);
    }

    const conta = await this.contaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true })
      .exec();

    if (!conta) {
      throw new NotFoundException('Conta financeira nao encontrada.');
    }

    await this.registrarAuditoria(conta, actorId, AUDITORIA_EVENTOS.CONTA_FINANCEIRA_ATUALIZADA, AUDITORIA_ENTIDADES.CONTA_FINANCEIRA, {
      nome: conta.nome,
      tipo: conta.tipo,
    });

    return conta;
  }

  async removeConta(id: string, actorId?: string, actorEmpresaId?: string) {
    const conta = await this.contaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { ativo: false }, { new: true })
      .exec();

    if (!conta) {
      throw new NotFoundException('Conta financeira nao encontrada.');
    }

    await this.registrarAuditoria(conta, actorId, AUDITORIA_EVENTOS.CONTA_FINANCEIRA_REMOVIDA, AUDITORIA_ENTIDADES.CONTA_FINANCEIRA, {
      nome: conta.nome,
      tipo: conta.tipo,
      operacao: 'desativada',
    });

    return conta;
  }

  async createCategoria(dto: CreateCategoriaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    await this.assertCategoriaNomeUnico(dto.empresaId, dto.nome, dto.tipo);

    const categoria = await this.categoriaModel.create({
      ...dto,
      empresaId: this.toObjectId(dto.empresaId, 'empresaId'),
      classificacao: dto.classificacao ?? CATEGORIA_FINANCEIRA_CLASSIFICACAO.EMPRESA,
      grupo: dto.grupo ?? 'outros',
      ativo: dto.ativo ?? true,
      recorrente: dto.recorrente ?? false,
      dedutivel: dto.dedutivel ?? false,
    });

    await this.registrarAuditoria(categoria, actorId, AUDITORIA_EVENTOS.CATEGORIA_FINANCEIRA_CRIADA, AUDITORIA_ENTIDADES.CATEGORIA_FINANCEIRA, {
      nome: categoria.nome,
      tipo: categoria.tipo,
      classificacao: categoria.classificacao,
    });

    return categoria;
  }

  findAllCategorias(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query: Record<string, unknown> = this.getEmpresaQuery(empresaId);
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.classificacao) query.classificacao = filtros.classificacao;
    if (filtros.grupo) query.grupo = filtros.grupo;
    this.aplicarFiltroAtivo(query, filtros.ativo);

    return this.categoriaModel.find(query).exec();
  }

  async findOneCategoria(id: string, empresaId?: string) {
    return this.getCategoriaDaEmpresa(id, empresaId);
  }

  async updateCategoria(id: string, dto: UpdateCategoriaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const categoriaAtual = await this.getCategoriaDaEmpresa(id, actorEmpresaId);
    const tipo = dto.tipo ?? categoriaAtual.tipo;
    if (dto.nome && (dto.nome !== categoriaAtual.nome || tipo !== categoriaAtual.tipo)) {
      await this.assertCategoriaNomeUnico(actorEmpresaId ?? categoriaAtual.empresaId.toString(), dto.nome, tipo, id);
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.empresaId) {
      updateData.empresaId = this.toObjectId(dto.empresaId, 'empresaId');
    }

    const categoria = await this.categoriaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true })
      .exec();

    if (!categoria) {
      throw new NotFoundException('Categoria financeira nao encontrada.');
    }

    await this.registrarAuditoria(categoria, actorId, AUDITORIA_EVENTOS.CATEGORIA_FINANCEIRA_ATUALIZADA, AUDITORIA_ENTIDADES.CATEGORIA_FINANCEIRA, {
      nome: categoria.nome,
      tipo: categoria.tipo,
      classificacao: categoria.classificacao,
    });

    return categoria;
  }

  async removeCategoria(id: string, actorId?: string, actorEmpresaId?: string) {
    const categoria = await this.categoriaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { ativo: false }, { new: true })
      .exec();

    if (!categoria) {
      throw new NotFoundException('Categoria financeira nao encontrada.');
    }

    await this.registrarAuditoria(categoria, actorId, AUDITORIA_EVENTOS.CATEGORIA_FINANCEIRA_REMOVIDA, AUDITORIA_ENTIDADES.CATEGORIA_FINANCEIRA, {
      nome: categoria.nome,
      tipo: categoria.tipo,
      operacao: 'desativada',
    });

    return categoria;
  }

  async createTitulo(dto: CreateTituloFinanceiroDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    const valorTotalCentavos = this.parseValor(dto.valorTotal, 'valorTotal');
    await this.assertCategoriaPertenceTipo(dto.categoriaId, actorEmpresaId, tituloTipoParaCategoriaTipo(dto.tipo));
    if (dto.contaId) {
      await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    }

    const titulo = await this.tituloModel.create({
      ...dto,
      empresaId: this.toObjectId(dto.empresaId, 'empresaId'),
      categoriaId: this.toObjectId(dto.categoriaId, 'categoriaId'),
      contaId: this.toOptionalObjectId(dto.contaId, 'contaId'),
      valorTotal: centavosParaDecimal128(valorTotalCentavos),
      valorPago: centavosParaDecimal128(0),
      dataCompetencia: this.toDate(dto.dataCompetencia, 'dataCompetencia'),
      dataVencimento: this.toDate(dto.dataVencimento, 'dataVencimento'),
      status: TITULO_FINANCEIRO_STATUS.ABERTO,
      contraparteTipo: dto.contraparteTipo ?? 'outro',
      contraparteId: this.toOptionalObjectId(dto.contraparteId, 'contraparteId'),
      origemId: this.toOptionalObjectId(dto.origemId, 'origemId'),
      recorrenciaId: this.toOptionalObjectId(dto.recorrenciaId, 'recorrenciaId'),
    });

    await this.registrarAuditoria(titulo, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_CRIADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      tipo: titulo.tipo,
      descricao: titulo.descricao,
      valorTotal: centavosParaString(valorTotalCentavos),
    });

    return titulo;
  }

  findAllTitulos(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query = this.montarQueryTitulos(empresaId, filtros);

    return this.tituloModel
      .find(query)
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('contaId', 'nome tipo')
      .sort({ dataVencimento: 1 })
      .exec();
  }

  async findOneTitulo(id: string, empresaId?: string) {
    const titulo = await this.tituloModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('contaId', 'nome tipo')
      .exec();

    if (!titulo) {
      return null;
    }

    return titulo;
  }

  async updateTitulo(id: string, dto: UpdateTituloFinanceiroDto, actorId?: string, actorEmpresaId?: string) {
    const tituloAtual = await this.getTituloDaEmpresa(id, actorEmpresaId);
    if (tituloAtual.status === TITULO_FINANCEIRO_STATUS.CANCELADO) {
      throw new BadRequestException('Titulo cancelado nao pode ser alterado.');
    }
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const tipo = dto.tipo ?? tituloAtual.tipo;
    const categoriaId = dto.categoriaId ?? tituloAtual.categoriaId.toString();
    await this.assertCategoriaPertenceTipo(categoriaId, actorEmpresaId, tituloTipoParaCategoriaTipo(tipo));
    if (dto.contaId) {
      await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.empresaId) updateData.empresaId = this.toObjectId(dto.empresaId, 'empresaId');
    if (dto.categoriaId) updateData.categoriaId = this.toObjectId(dto.categoriaId, 'categoriaId');
    if (dto.contaId) updateData.contaId = this.toObjectId(dto.contaId, 'contaId');
    if (dto.contraparteId) updateData.contraparteId = this.toObjectId(dto.contraparteId, 'contraparteId');
    if (dto.origemId) updateData.origemId = this.toObjectId(dto.origemId, 'origemId');
    if (dto.recorrenciaId) updateData.recorrenciaId = this.toObjectId(dto.recorrenciaId, 'recorrenciaId');
    if (dto.valorTotal) {
      const novoTotalCentavos = this.parseValor(dto.valorTotal, 'valorTotal');
      const pagoAtualCentavos = dinheiroParaCentavos(tituloAtual.valorPago);
      if (novoTotalCentavos < pagoAtualCentavos) {
        throw new BadRequestException('Valor total nao pode ser menor que o valor ja pago.');
      }
      updateData.valorTotal = centavosParaDecimal128(novoTotalCentavos);
      updateData.status = calcularStatusTitulo(updateData.valorTotal, tituloAtual.valorPago);
    }
    if (dto.dataCompetencia) updateData.dataCompetencia = this.toDate(dto.dataCompetencia, 'dataCompetencia');
    if (dto.dataVencimento) updateData.dataVencimento = this.toDate(dto.dataVencimento, 'dataVencimento');

    const titulo = await this.tituloModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true })
      .exec();

    if (!titulo) {
      throw new NotFoundException('Titulo financeiro nao encontrado.');
    }

    await this.registrarAuditoria(titulo, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_ATUALIZADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      tipo: titulo.tipo,
      descricao: titulo.descricao,
      status: titulo.status,
    });

    return titulo;
  }

  async cancelarTitulo(id: string, actorId?: string, actorEmpresaId?: string) {
    const tituloAtual = await this.getTituloDaEmpresa(id, actorEmpresaId);
    if (tituloAtual.status === TITULO_FINANCEIRO_STATUS.CANCELADO) {
      return tituloAtual;
    }
    if (dinheiroParaCentavos(tituloAtual.valorPago) > 0) {
      throw new BadRequestException('Titulo com baixa financeira deve ser estornado antes de cancelar.');
    }

    const titulo = await this.tituloModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { status: TITULO_FINANCEIRO_STATUS.CANCELADO }, { new: true })
      .exec();

    if (!titulo) {
      throw new NotFoundException('Titulo financeiro nao encontrado.');
    }

    await this.registrarAuditoria(titulo, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_CANCELADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      descricao: titulo.descricao,
      status: titulo.status,
    });

    return titulo;
  }

  async baixarTitulo(id: string, dto: BaixarTituloFinanceiroDto, actorId?: string, actorEmpresaId?: string) {
    const titulo = await this.getTituloDaEmpresa(id, actorEmpresaId);
    this.assertTituloPodeSerBaixado(titulo);

    const valorBaixaCentavos = this.parseValor(dto.valor, 'valor');
    const valorPagoCentavos = dinheiroParaCentavos(titulo.valorPago);
    const valorTotalCentavos = dinheiroParaCentavos(titulo.valorTotal);
    if (valorPagoCentavos + valorBaixaCentavos > valorTotalCentavos) {
      throw new BadRequestException('Valor da baixa excede o saldo em aberto do titulo.');
    }

    const conta = await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    await this.assertCategoriaPertenceTipo(titulo.categoriaId.toString(), actorEmpresaId, tituloTipoParaCategoriaTipo(titulo.tipo));

    const movimento = await this.registrarMovimento({
      empresaId: titulo.empresaId,
      contaId: conta._id as Types.ObjectId,
      categoriaId: titulo.categoriaId,
      tituloId: titulo._id as Types.ObjectId,
      tipo: tituloTipoParaMovimentoTipo(titulo.tipo),
      descricao: `Baixa - ${titulo.descricao}`,
      valorCentavos: valorBaixaCentavos,
      dataMovimento: this.toDate(dto.dataPagamento, 'dataPagamento'),
      formaPagamento: dto.formaPagamento,
      origemTipo: 'titulo_financeiro',
      origemId: titulo._id as Types.ObjectId,
      observacoes: dto.observacoes,
    }, actorId);

    const novoValorPagoCentavos = valorPagoCentavos + valorBaixaCentavos;
    const status = calcularStatusTitulo(titulo.valorTotal, centavosParaDecimal128(novoValorPagoCentavos));
    const tituloAtualizado = await this.atualizarPagamentoTitulo(
      id,
      novoValorPagoCentavos,
      status,
      status === TITULO_FINANCEIRO_STATUS.QUITADO ? this.toDate(dto.dataPagamento, 'dataPagamento') : undefined,
      conta._id as Types.ObjectId,
      actorEmpresaId,
    );

    await this.registrarAuditoria(tituloAtualizado, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_BAIXADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      descricao: tituloAtualizado.descricao,
      valorBaixa: centavosParaString(valorBaixaCentavos),
      status,
      movimentoId: movimento._id?.toString(),
    });

    return {
      titulo: tituloAtualizado,
      movimento,
    };
  }

  async createMovimento(dto: CreateMovimentoCaixaDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    await this.assertCategoriaPertenceTipo(dto.categoriaId, actorEmpresaId, dto.tipo);
    const valorCentavos = this.parseValor(dto.valor, 'valor');

    return this.registrarMovimento({
      empresaId: dto.empresaId,
      contaId: dto.contaId,
      categoriaId: dto.categoriaId,
      tipo: dto.tipo,
      descricao: dto.descricao,
      valorCentavos,
      dataMovimento: this.toDate(dto.dataMovimento, 'dataMovimento'),
      formaPagamento: dto.formaPagamento,
      origemTipo: dto.origemTipo,
      origemId: dto.origemId,
      observacoes: dto.observacoes,
    }, actorId);
  }

  findAllMovimentos(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query = this.montarQueryMovimentos(empresaId, filtros);

    return this.movimentoModel
      .find(query)
      .populate('contaId', 'nome tipo')
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('tituloId', 'descricao tipo status')
      .sort({ dataMovimento: -1 })
      .exec();
  }

  async findOneMovimento(id: string, empresaId?: string) {
    const movimento = await this.movimentoModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('contaId', 'nome tipo')
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('tituloId', 'descricao tipo status')
      .exec();

    if (!movimento) {
      return null;
    }

    return movimento;
  }

  async estornarMovimento(id: string, dto: EstornarMovimentoCaixaDto, actorId?: string, actorEmpresaId?: string) {
    const movimento = await this.getMovimentoDaEmpresa(id, actorEmpresaId);
    if (movimento.status === MOVIMENTO_CAIXA_STATUS.ESTORNADO) {
      throw new BadRequestException('Movimento ja estornado.');
    }

    await this.atualizarSaldoConta(
      movimento.contaId.toString(),
      movimento.tipo === MOVIMENTO_CAIXA_TIPO.ENTRADA ? -dinheiroParaCentavos(movimento.valor) : dinheiroParaCentavos(movimento.valor),
      actorEmpresaId,
    );

    const updateData: Record<string, unknown> = {
      status: MOVIMENTO_CAIXA_STATUS.ESTORNADO,
      estornadoEm: new Date(),
      motivoEstorno: dto.motivo,
    };
    if (actorId) {
      updateData.estornadoPor = this.toObjectId(actorId, 'usuarioId');
    }

    const estornado = await this.movimentoModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true })
      .exec();

    if (!estornado) {
      throw new NotFoundException('Movimento de caixa nao encontrado.');
    }

    if (movimento.tituloId) {
      await this.estornarBaixaTitulo(movimento.tituloId.toString(), dinheiroParaCentavos(movimento.valor), actorId, actorEmpresaId);
    }

    await this.registrarAuditoria(estornado, actorId, AUDITORIA_EVENTOS.MOVIMENTO_CAIXA_ESTORNADO, AUDITORIA_ENTIDADES.MOVIMENTO_CAIXA, {
      tipo: estornado.tipo,
      valor: centavosParaString(dinheiroParaCentavos(estornado.valor)),
      motivo: dto.motivo,
    });

    return estornado;
  }

  async getLivroCaixa(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query = this.montarQueryMovimentos(empresaId, {
      ...filtros,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    });

    const movimentos = await this.movimentoModel
      .find(query)
      .populate('contaId', 'nome tipo')
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .sort({ dataMovimento: 1 })
      .lean()
      .exec();

    const totalEntradasCentavos = movimentos
      .filter((movimento) => movimento.tipo === MOVIMENTO_CAIXA_TIPO.ENTRADA)
      .reduce((sum, movimento) => sum + dinheiroParaCentavos(movimento.valor), 0);
    const totalSaidasCentavos = movimentos
      .filter((movimento) => movimento.tipo === MOVIMENTO_CAIXA_TIPO.SAIDA)
      .reduce((sum, movimento) => sum + dinheiroParaCentavos(movimento.valor), 0);

    return {
      filtros,
      quantidade: movimentos.length,
      totalEntradas: centavosParaString(totalEntradasCentavos),
      totalSaidas: centavosParaString(totalSaidasCentavos),
      saldoPeriodo: centavosParaString(totalEntradasCentavos - totalSaidasCentavos),
      movimentos,
    };
  }

  async createRecorrencia(dto: CreateRecorrenciaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    const valorCentavos = this.parseValor(dto.valor, 'valor');
    await this.assertCategoriaPertenceTipo(dto.categoriaId, actorEmpresaId, tituloTipoParaCategoriaTipo(dto.tipoTitulo));
    if (dto.contaId) {
      await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    }

    const inicioEm = this.toDate(dto.inicioEm, 'inicioEm');
    const fimEm = dto.fimEm ? this.toDate(dto.fimEm, 'fimEm') : undefined;
    if (fimEm && fimEm < inicioEm) {
      throw new BadRequestException('Data final da recorrencia nao pode ser anterior ao inicio.');
    }

    const recorrencia = await this.recorrenciaModel.create({
      ...dto,
      empresaId: this.toObjectId(dto.empresaId, 'empresaId'),
      categoriaId: this.toObjectId(dto.categoriaId, 'categoriaId'),
      contaId: this.toOptionalObjectId(dto.contaId, 'contaId'),
      valor: centavosParaDecimal128(valorCentavos),
      inicioEm,
      fimEm,
      proximaCompetencia: dto.proximaCompetencia ? this.toDate(dto.proximaCompetencia, 'proximaCompetencia') : inicioEm,
      status: dto.status ?? RECORRENCIA_FINANCEIRA_STATUS.ATIVA,
      contraparteTipo: dto.contraparteTipo ?? 'outro',
      contraparteId: this.toOptionalObjectId(dto.contraparteId, 'contraparteId'),
    });

    await this.registrarAuditoria(recorrencia, actorId, AUDITORIA_EVENTOS.RECORRENCIA_FINANCEIRA_CRIADA, AUDITORIA_ENTIDADES.RECORRENCIA_FINANCEIRA, {
      descricao: recorrencia.descricao,
      frequencia: recorrencia.frequencia,
      valor: centavosParaString(valorCentavos),
    });

    return recorrencia;
  }

  findAllRecorrencias(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query: Record<string, unknown> = this.getEmpresaQuery(empresaId);
    if (filtros.status) query.status = filtros.status;
    if (filtros.tipoTitulo) query.tipoTitulo = filtros.tipoTitulo;
    if (filtros.categoriaId) query.categoriaId = this.toObjectId(filtros.categoriaId, 'categoriaId');

    return this.recorrenciaModel
      .find(query)
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('contaId', 'nome tipo')
      .sort({ proximaCompetencia: 1 })
      .exec();
  }

  async findOneRecorrencia(id: string, empresaId?: string) {
    const recorrencia = await this.recorrenciaModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('categoriaId', 'nome tipo classificacao grupo')
      .populate('contaId', 'nome tipo')
      .exec();

    return recorrencia ?? null;
  }

  async updateRecorrencia(id: string, dto: UpdateRecorrenciaFinanceiraDto, actorId?: string, actorEmpresaId?: string) {
    const atual = await this.getRecorrenciaDaEmpresa(id, actorEmpresaId);
    if (dto.empresaId) {
      this.assertEmpresaPermitida(dto.empresaId, actorEmpresaId);
    }

    const tipoTitulo = dto.tipoTitulo ?? atual.tipoTitulo;
    const categoriaId = dto.categoriaId ?? atual.categoriaId.toString();
    await this.assertCategoriaPertenceTipo(categoriaId, actorEmpresaId, tituloTipoParaCategoriaTipo(tipoTitulo));
    if (dto.contaId) {
      await this.getContaDaEmpresa(dto.contaId, actorEmpresaId);
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.empresaId) updateData.empresaId = this.toObjectId(dto.empresaId, 'empresaId');
    if (dto.categoriaId) updateData.categoriaId = this.toObjectId(dto.categoriaId, 'categoriaId');
    if (dto.contaId) updateData.contaId = this.toObjectId(dto.contaId, 'contaId');
    if (dto.contraparteId) updateData.contraparteId = this.toObjectId(dto.contraparteId, 'contraparteId');
    if (dto.valor) updateData.valor = centavosParaDecimal128(this.parseValor(dto.valor, 'valor'));
    if (dto.inicioEm) updateData.inicioEm = this.toDate(dto.inicioEm, 'inicioEm');
    if (dto.fimEm) updateData.fimEm = this.toDate(dto.fimEm, 'fimEm');
    if (dto.proximaCompetencia) updateData.proximaCompetencia = this.toDate(dto.proximaCompetencia, 'proximaCompetencia');

    const recorrencia = await this.recorrenciaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateData, { new: true })
      .exec();

    if (!recorrencia) {
      throw new NotFoundException('Recorrencia financeira nao encontrada.');
    }

    await this.registrarAuditoria(recorrencia, actorId, AUDITORIA_EVENTOS.RECORRENCIA_FINANCEIRA_ATUALIZADA, AUDITORIA_ENTIDADES.RECORRENCIA_FINANCEIRA, {
      descricao: recorrencia.descricao,
      status: recorrencia.status,
    });

    return recorrencia;
  }

  async removeRecorrencia(id: string, actorId?: string, actorEmpresaId?: string) {
    const recorrencia = await this.recorrenciaModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), { status: RECORRENCIA_FINANCEIRA_STATUS.ENCERRADA }, { new: true })
      .exec();

    if (!recorrencia) {
      throw new NotFoundException('Recorrencia financeira nao encontrada.');
    }

    await this.registrarAuditoria(recorrencia, actorId, AUDITORIA_EVENTOS.RECORRENCIA_FINANCEIRA_REMOVIDA, AUDITORIA_ENTIDADES.RECORRENCIA_FINANCEIRA, {
      descricao: recorrencia.descricao,
      operacao: 'encerrada',
    });

    return recorrencia;
  }

  async gerarProximoTituloRecorrente(id: string, actorId?: string, actorEmpresaId?: string) {
    const recorrencia = await this.getRecorrenciaDaEmpresa(id, actorEmpresaId);
    return this.gerarTituloDaRecorrencia(recorrencia, actorId, actorEmpresaId);
  }

  async gerarRecorrenciasPendentes(dto: GerarRecorrenciasFinanceirasDto, actorId?: string, actorEmpresaId?: string) {
    const ateCompetencia = dto.ateCompetencia ? this.toDate(dto.ateCompetencia, 'ateCompetencia') : new Date();
    const recorrencias = await this.recorrenciaModel
      .find(this.getEmpresaQuery(actorEmpresaId, {
        status: RECORRENCIA_FINANCEIRA_STATUS.ATIVA,
        proximaCompetencia: { $lte: ateCompetencia },
      }))
      .exec();

    const titulos: TituloFinanceiroDocument[] = [];
    for (const recorrencia of recorrencias) {
      titulos.push(await this.gerarTituloDaRecorrencia(recorrencia, actorId, actorEmpresaId));
    }

    return {
      quantidade: titulos.length,
      titulos,
    };
  }

  private async gerarTituloDaRecorrencia(recorrencia: RecorrenciaFinanceiraDocument, actorId?: string, actorEmpresaId?: string) {
    if (recorrencia.status !== RECORRENCIA_FINANCEIRA_STATUS.ATIVA) {
      throw new BadRequestException('Recorrencia financeira nao esta ativa.');
    }

    const competencia = new Date(recorrencia.proximaCompetencia);
    if (recorrencia.fimEm && competencia > new Date(recorrencia.fimEm)) {
      await this.recorrenciaModel
        .findByIdAndUpdate(recorrencia._id, { status: RECORRENCIA_FINANCEIRA_STATUS.ENCERRADA }, { new: true })
        .exec();
      throw new BadRequestException('Recorrencia financeira encerrada pela data final.');
    }

    const titulo = await this.createTitulo({
      empresaId: recorrencia.empresaId.toString(),
      tipo: recorrencia.tipoTitulo,
      categoriaId: recorrencia.categoriaId.toString(),
      contaId: recorrencia.contaId?.toString(),
      descricao: recorrencia.descricao,
      valorTotal: centavosParaString(dinheiroParaCentavos(recorrencia.valor)),
      dataCompetencia: competencia.toISOString(),
      dataVencimento: vencimentoDaCompetencia(competencia, recorrencia.diaVencimento).toISOString(),
      contraparteTipo: recorrencia.contraparteTipo,
      contraparteId: recorrencia.contraparteId?.toString(),
      documentoNumero: recorrencia.documentoNumero,
      origemTipo: 'recorrencia_financeira',
      origemId: recorrencia._id?.toString(),
      recorrenciaId: recorrencia._id?.toString(),
      observacoes: recorrencia.observacoes,
    }, actorId, actorEmpresaId);

    const proximaCompetencia = avancarCompetencia(competencia, recorrencia.frequencia as RecorrenciaFinanceiraFrequencia);
    const status = recorrencia.fimEm && proximaCompetencia > new Date(recorrencia.fimEm)
      ? RECORRENCIA_FINANCEIRA_STATUS.ENCERRADA
      : recorrencia.status;

    await this.recorrenciaModel
      .findByIdAndUpdate(recorrencia._id, { proximaCompetencia, status }, { new: true })
      .exec();

    await this.registrarAuditoria(recorrencia, actorId, AUDITORIA_EVENTOS.RECORRENCIA_FINANCEIRA_PROCESSADA, AUDITORIA_ENTIDADES.RECORRENCIA_FINANCEIRA, {
      tituloId: titulo._id?.toString(),
      competencia: competencia.toISOString(),
      proximaCompetencia: proximaCompetencia.toISOString(),
    });

    return titulo;
  }

  private async registrarMovimento(input: RegistrarMovimentoInput, actorId?: string) {
    const movimento = await this.movimentoModel.create({
      empresaId: this.toObjectId(input.empresaId.toString(), 'empresaId'),
      contaId: this.toObjectId(input.contaId.toString(), 'contaId'),
      categoriaId: this.toObjectId(input.categoriaId.toString(), 'categoriaId'),
      tituloId: input.tituloId ? this.toObjectId(input.tituloId.toString(), 'tituloId') : undefined,
      tipo: input.tipo,
      descricao: input.descricao,
      valor: centavosParaDecimal128(input.valorCentavos),
      dataMovimento: input.dataMovimento,
      formaPagamento: input.formaPagamento,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
      origemTipo: input.origemTipo,
      origemId: input.origemId ? this.toObjectId(input.origemId.toString(), 'origemId') : undefined,
      observacoes: input.observacoes,
    });

    await this.atualizarSaldoConta(
      input.contaId.toString(),
      input.tipo === MOVIMENTO_CAIXA_TIPO.ENTRADA ? input.valorCentavos : -input.valorCentavos,
      input.empresaId.toString(),
    );

    await this.registrarAuditoria(movimento, actorId, AUDITORIA_EVENTOS.MOVIMENTO_CAIXA_REGISTRADO, AUDITORIA_ENTIDADES.MOVIMENTO_CAIXA, {
      tipo: movimento.tipo,
      descricao: movimento.descricao,
      valor: centavosParaString(input.valorCentavos),
      formaPagamento: movimento.formaPagamento,
    });

    return movimento;
  }

  private async estornarBaixaTitulo(tituloId: string, valorEstornadoCentavos: number, actorId?: string, actorEmpresaId?: string) {
    const titulo = await this.getTituloDaEmpresa(tituloId, actorEmpresaId);
    const novoValorPagoCentavos = Math.max(0, dinheiroParaCentavos(titulo.valorPago) - valorEstornadoCentavos);
    const status = calcularStatusTitulo(titulo.valorTotal, centavosParaDecimal128(novoValorPagoCentavos));
    const atualizado = await this.atualizarPagamentoTitulo(tituloId, novoValorPagoCentavos, status, undefined, undefined, actorEmpresaId);

    await this.registrarAuditoria(atualizado, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_ESTORNADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      descricao: atualizado.descricao,
      valorEstornado: centavosParaString(valorEstornadoCentavos),
      status,
    });
  }

  private async atualizarPagamentoTitulo(
    id: string,
    valorPagoCentavos: number,
    status: string,
    dataPagamento?: Date,
    contaId?: Types.ObjectId,
    empresaId?: string,
  ) {
    const update: Record<string, unknown> = {
      $set: {
        valorPago: centavosParaDecimal128(valorPagoCentavos),
        status,
        ...(contaId ? { contaId } : {}),
        ...(dataPagamento ? { dataPagamento } : {}),
      },
    };

    if (!dataPagamento) {
      update.$unset = { dataPagamento: '' };
    }

    const titulo = await this.tituloModel
      .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: id }), update, { new: true })
      .exec();

    if (!titulo) {
      throw new NotFoundException('Titulo financeiro nao encontrado.');
    }

    return titulo;
  }

  private async atualizarSaldoConta(contaId: string, deltaCentavos: number, empresaId?: string) {
    const conta = await this.getContaDaEmpresa(contaId, empresaId);
    const saldoAtualCentavos = dinheiroParaCentavos(conta.saldoAtual);
    const novoSaldo = saldoAtualCentavos + deltaCentavos;

    await this.contaModel
      .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: contaId }), { saldoAtual: centavosParaDecimal128(novoSaldo) }, { new: true })
      .exec();
  }

  private montarQueryTitulos(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query: Record<string, unknown> = this.getEmpresaQuery(empresaId);
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.status) query.status = filtros.status;
    if (filtros.categoriaId) query.categoriaId = this.toObjectId(filtros.categoriaId, 'categoriaId');
    if (filtros.contaId) query.contaId = this.toObjectId(filtros.contaId, 'contaId');
    this.aplicarIntervaloData(query, 'dataVencimento', filtros.vencimentoInicio, filtros.vencimentoFim);
    this.aplicarIntervaloData(query, 'dataCompetencia', filtros.competenciaInicio, filtros.competenciaFim);
    return query;
  }

  private montarQueryMovimentos(empresaId?: string, filtros: FiltrosFinanceiros = {}) {
    const query: Record<string, unknown> = this.getEmpresaQuery(empresaId);
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.status) query.status = filtros.status;
    if (filtros.categoriaId) query.categoriaId = this.toObjectId(filtros.categoriaId, 'categoriaId');
    if (filtros.contaId) query.contaId = this.toObjectId(filtros.contaId, 'contaId');
    this.aplicarIntervaloData(query, 'dataMovimento', filtros.inicio, filtros.fim);
    return query;
  }

  private aplicarIntervaloData(query: Record<string, unknown>, field: string, inicio?: string, fim?: string) {
    if (!inicio && !fim) {
      return;
    }

    const range: Record<string, Date> = {};
    if (inicio) range.$gte = this.toDate(inicio, field);
    if (fim) range.$lte = this.toDate(fim, field);
    query[field] = range;
  }

  private aplicarFiltroAtivo(query: Record<string, unknown>, ativo?: string) {
    if (ativo === undefined) {
      return;
    }

    query.ativo = ativo === 'true';
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private assertEmpresaPermitida(empresaId?: string, actorEmpresaId?: string) {
    if (actorEmpresaId && empresaId && String(empresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Empresa do registro nao corresponde a empresa do usuario autenticado.');
    }
  }

  private parseValor(value: string, field: string, positive = true) {
    const centavos = dinheiroParaCentavos(value);
    if (!Number.isFinite(centavos)) {
      throw new BadRequestException(`${field} invalido.`);
    }
    if (positive && centavos <= 0) {
      throw new BadRequestException(`${field} deve ser maior que zero.`);
    }
    if (!positive && centavos < 0) {
      throw new BadRequestException(`${field} nao pode ser negativo.`);
    }
    return centavos;
  }

  private toDate(value: string | Date, field: string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} invalida.`);
    }
    return date;
  }

  private toObjectId(value: string, field: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${field} invalido.`);
    }

    return new Types.ObjectId(value);
  }

  private toOptionalObjectId(value: string | undefined, field: string) {
    return value ? this.toObjectId(value, field) : undefined;
  }

  private async getContaDaEmpresa(id: string, empresaId?: string) {
    const conta = await this.contaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
    if (!conta) {
      throw new NotFoundException('Conta financeira nao encontrada.');
    }

    return conta;
  }

  private async getCategoriaDaEmpresa(id: string, empresaId?: string) {
    const categoria = await this.categoriaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
    if (!categoria) {
      throw new NotFoundException('Categoria financeira nao encontrada.');
    }

    return categoria;
  }

  private async getTituloDaEmpresa(id: string, empresaId?: string) {
    const titulo = await this.tituloModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
    if (!titulo) {
      throw new NotFoundException('Titulo financeiro nao encontrado.');
    }

    return titulo;
  }

  private async getMovimentoDaEmpresa(id: string, empresaId?: string) {
    const movimento = await this.movimentoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
    if (!movimento) {
      throw new NotFoundException('Movimento de caixa nao encontrado.');
    }

    return movimento;
  }

  private async getRecorrenciaDaEmpresa(id: string, empresaId?: string) {
    const recorrencia = await this.recorrenciaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
    if (!recorrencia) {
      throw new NotFoundException('Recorrencia financeira nao encontrada.');
    }

    return recorrencia;
  }

  private async assertCategoriaPertenceTipo(id: string, empresaId: string | undefined, tipo: string) {
    const categoria = await this.getCategoriaDaEmpresa(id, empresaId);
    if (categoria.tipo !== tipo) {
      throw new BadRequestException('Categoria financeira incompativel com o tipo do lancamento.');
    }
    if (categoria.ativo === false) {
      throw new BadRequestException('Categoria financeira esta inativa.');
    }
  }

  private assertTituloPodeSerBaixado(titulo: TituloFinanceiroDocument) {
    if (titulo.status === TITULO_FINANCEIRO_STATUS.CANCELADO) {
      throw new BadRequestException('Titulo cancelado nao pode ser baixado.');
    }
    if (titulo.status === TITULO_FINANCEIRO_STATUS.QUITADO) {
      throw new BadRequestException('Titulo ja esta quitado.');
    }
  }

  private async assertContaNomeUnico(empresaId: string, nome: string, ignoredId?: string) {
    const query: Record<string, unknown> = { empresaId, nome };
    if (ignoredId) {
      query._id = { $ne: ignoredId };
    }

    const existing = await this.contaModel.exists(query).exec();
    if (existing) {
      throw new BadRequestException('Conta financeira com este nome ja existe.');
    }
  }

  private async assertCategoriaNomeUnico(empresaId: string, nome: string, tipo: string, ignoredId?: string) {
    const query: Record<string, unknown> = { empresaId, nome, tipo };
    if (ignoredId) {
      query._id = { $ne: ignoredId };
    }

    const existing = await this.categoriaModel.exists(query).exec();
    if (existing) {
      throw new BadRequestException('Categoria financeira com este nome e tipo ja existe.');
    }
  }

  private async registrarAuditoria(
    entity: { _id?: unknown; empresaId?: unknown },
    actorId: string | undefined,
    tipoEvento: (typeof AUDITORIA_EVENTOS)[keyof typeof AUDITORIA_EVENTOS],
    entidade: (typeof AUDITORIA_ENTIDADES)[keyof typeof AUDITORIA_ENTIDADES],
    dados?: Record<string, unknown>,
  ) {
    if (!actorId || !entity._id || !entity.empresaId) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: entity.empresaId as Types.ObjectId,
      usuarioId: actorId,
      tipoEvento,
      entidade,
      entidadeId: entity._id as Types.ObjectId,
      dados,
    });
  }
}
