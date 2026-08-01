import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Model, Types } from 'mongoose';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { Empresa, EmpresaDocument } from '../../core/empresa/schemas/empresa.schema';
import { SimplePdfBuilder } from '../../documentos/simple-pdf';
import { CreateAnexoFinanceiroDto } from './dto/create-anexo-financeiro.dto';
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
import { ListAnexosFinanceirosQueryDto } from './dto/list-anexos-financeiros-query.dto';
import { RelatorioMensalFinanceiroQueryDto } from './dto/relatorio-mensal-financeiro-query.dto';
import { ContaFinanceira, ContaFinanceiraDocument } from './schemas/conta-financeira.schema';
import { CategoriaFinanceira, CategoriaFinanceiraDocument } from './schemas/categoria-financeira.schema';
import { TituloFinanceiro, TituloFinanceiroDocument } from './schemas/titulo-financeiro.schema';
import { MovimentoCaixa, MovimentoCaixaDocument } from './schemas/movimento-caixa.schema';
import { RecorrenciaFinanceira, RecorrenciaFinanceiraDocument } from './schemas/recorrencia-financeira.schema';
import { AnexoFinanceiro, AnexoFinanceiroDocument, ANEXO_FINANCEIRO_VINCULO_TIPO } from './schemas/anexo-financeiro.schema';
import { buildSimpleXlsx, SimpleXlsxSheet } from './simple-xlsx';
import {
  CATEGORIA_FINANCEIRA_CLASSIFICACAO,
  CATEGORIA_FINANCEIRA_TIPO,
  CONTA_FINANCEIRA_TIPO,
  FORMA_PAGAMENTO_FINANCEIRO,
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
  normalizarFormaPagamentoFinanceiro,
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

interface UpsertTituloIntegracaoInput {
  empresaId: string;
  tipo: string;
  categoriaId: string;
  descricao: string;
  valorTotal: unknown;
  dataCompetencia: Date | string;
  dataVencimento: Date | string;
  contraparteTipo: string;
  contraparteId?: string;
  origemTipo: string;
  origemId: string;
  observacoes?: string;
}

interface BaixarTituloIntegradoInput {
  titulo: TituloFinanceiroDocument;
  contaId: string;
  valor: unknown;
  dataPagamento: Date | string;
  formaPagamento: string;
  origemTipo: string;
  origemId: string;
  descricao: string;
  observacoes?: string;
}

interface UploadedFinanceiroFile {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
}

interface PeriodoRelatorio {
  competencia: string;
  inicio: Date;
  fim: Date;
}

export interface RelatorioFinanceiroMensalDados {
  empresa: any;
  periodo: PeriodoRelatorio;
  contas: any[];
  categorias: any[];
  movimentos: any[];
  titulos: any[];
  recorrencias: any[];
  anexos: any[];
  resumo: {
    saldoContasCentavos: number;
    entradasCentavos: number;
    saidasCentavos: number;
    saldoPeriodoCentavos: number;
    receberAbertoCentavos: number;
    pagarAbertoCentavos: number;
    despesasFixasCentavos: number;
    proLaboreCentavos: number;
    titulosVencidos: number;
    quantidadeMovimentos: number;
    quantidadeAnexos: number;
  };
}

@Injectable()
export class FinanceiroAdmService {
  constructor(
    @InjectModel(ContaFinanceira.name) private contaModel: Model<ContaFinanceiraDocument>,
    @InjectModel(CategoriaFinanceira.name) private categoriaModel: Model<CategoriaFinanceiraDocument>,
    @InjectModel(TituloFinanceiro.name) private tituloModel: Model<TituloFinanceiroDocument>,
    @InjectModel(MovimentoCaixa.name) private movimentoModel: Model<MovimentoCaixaDocument>,
    @InjectModel(RecorrenciaFinanceira.name) private recorrenciaModel: Model<RecorrenciaFinanceiraDocument>,
    @InjectModel(AnexoFinanceiro.name) private anexoModel: Model<AnexoFinanceiroDocument>,
    @InjectModel(Empresa.name) private empresaModel: Model<EmpresaDocument>,
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

  async getRelatorioMensalDados(query: RelatorioMensalFinanceiroQueryDto = {}, actorEmpresaId?: string): Promise<RelatorioFinanceiroMensalDados> {
    const empresaId = this.requireEmpresaId(actorEmpresaId);
    const periodo = this.montarPeriodoRelatorio(query);
    const intervalo = { $gte: periodo.inicio, $lte: periodo.fim };

    const [empresa, contas, categorias, movimentos, titulos, recorrencias, anexos] = await Promise.all([
      this.empresaModel.findById(empresaId).lean().exec(),
      this.contaModel.find(this.getEmpresaQuery(empresaId, { ativo: true })).lean().exec(),
      this.categoriaModel.find(this.getEmpresaQuery(empresaId, { ativo: true })).lean().exec(),
      this.movimentoModel
        .find(this.getEmpresaQuery(empresaId, {
          status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
          dataMovimento: intervalo,
        }))
        .populate('contaId', 'nome tipo')
        .populate('categoriaId', 'nome tipo classificacao grupo')
        .sort({ dataMovimento: 1 })
        .lean()
        .exec(),
      this.tituloModel
        .find(this.getEmpresaQuery(empresaId, {
          $or: [
            { dataCompetencia: intervalo },
            { dataVencimento: intervalo },
            { dataPagamento: intervalo },
          ],
        }))
        .populate('categoriaId', 'nome tipo classificacao grupo')
        .populate('contaId', 'nome tipo')
        .sort({ dataVencimento: 1 })
        .lean()
        .exec(),
      this.recorrenciaModel
        .find(this.getEmpresaQuery(empresaId, {
          status: RECORRENCIA_FINANCEIRA_STATUS.ATIVA,
        }))
        .populate('categoriaId', 'nome tipo classificacao grupo')
        .populate('contaId', 'nome tipo')
        .sort({ proximaCompetencia: 1 })
        .lean()
        .exec(),
      this.findAllAnexos({
        inicio: this.dateToInput(periodo.inicio),
        fim: this.dateToInput(periodo.fim),
      }, empresaId),
    ]);

    const entradasCentavos = movimentos
      .filter((movimento) => movimento.tipo === MOVIMENTO_CAIXA_TIPO.ENTRADA)
      .reduce((sum, movimento) => sum + dinheiroParaCentavos(movimento.valor), 0);
    const saidasCentavos = movimentos
      .filter((movimento) => movimento.tipo === MOVIMENTO_CAIXA_TIPO.SAIDA)
      .reduce((sum, movimento) => sum + dinheiroParaCentavos(movimento.valor), 0);
    const receberAbertoCentavos = titulos
      .filter((titulo) => titulo.tipo === TITULO_FINANCEIRO_TIPO.RECEBER && this.isTituloAberto(titulo.status))
      .reduce((sum, titulo) => sum + this.valorAbertoTituloCentavos(titulo), 0);
    const pagarAbertoCentavos = titulos
      .filter((titulo) => titulo.tipo === TITULO_FINANCEIRO_TIPO.PAGAR && this.isTituloAberto(titulo.status))
      .reduce((sum, titulo) => sum + this.valorAbertoTituloCentavos(titulo), 0);
    const despesasFixasCentavos = recorrencias
      .filter((recorrencia) => recorrencia.tipoTitulo === TITULO_FINANCEIRO_TIPO.PAGAR)
      .reduce((sum, recorrencia) => sum + dinheiroParaCentavos(recorrencia.valor), 0);
    const proLaboreCentavos = movimentos
      .filter((movimento) => movimento.tipo === MOVIMENTO_CAIXA_TIPO.SAIDA && this.isCategoriaProLabore(movimento.categoriaId))
      .reduce((sum, movimento) => sum + dinheiroParaCentavos(movimento.valor), 0);
    const saldoContasCentavos = contas.reduce((sum, conta) => sum + dinheiroParaCentavos(conta.saldoAtual), 0);
    const hoje = new Date();
    const titulosVencidos = titulos.filter((titulo) => this.isTituloAberto(titulo.status) && new Date(titulo.dataVencimento) < hoje).length;

    return {
      empresa,
      periodo,
      contas,
      categorias,
      movimentos,
      titulos,
      recorrencias,
      anexos,
      resumo: {
        saldoContasCentavos,
        entradasCentavos,
        saidasCentavos,
        saldoPeriodoCentavos: entradasCentavos - saidasCentavos,
        receberAbertoCentavos,
        pagarAbertoCentavos,
        despesasFixasCentavos,
        proLaboreCentavos,
        titulosVencidos,
        quantidadeMovimentos: movimentos.length,
        quantidadeAnexos: anexos.length,
      },
    };
  }

  async gerarRelatorioMensalPdf(query: RelatorioMensalFinanceiroQueryDto = {}, actorId?: string, actorEmpresaId?: string) {
    const dados = await this.getRelatorioMensalDados(query, actorEmpresaId);
    const pdf = new SimplePdfBuilder();

    pdf.addTitle('RELATORIO FINANCEIRO MENSAL');
    pdf.addSection('Empresa');
    pdf.addKeyValue('Nome fantasia', dados.empresa?.nomeFantasia || '-');
    pdf.addKeyValue('Razao social', dados.empresa?.razaoSocial || '-');
    pdf.addKeyValue('CNPJ', dados.empresa?.cnpj || '-');
    pdf.addKeyValue('Competencia', dados.periodo.competencia);
    pdf.addKeyValue('Periodo', `${this.formatDate(dados.periodo.inicio)} ate ${this.formatDate(dados.periodo.fim)}`);
    pdf.addKeyValue('Gerado em', this.formatDateTime(new Date()));

    pdf.addSection('Resumo');
    pdf.addTable(
      ['Indicador', 'Valor'],
      [
        ['Saldo em contas', this.formatMoneyCentavos(dados.resumo.saldoContasCentavos)],
        ['Entradas', this.formatMoneyCentavos(dados.resumo.entradasCentavos)],
        ['Saidas', this.formatMoneyCentavos(dados.resumo.saidasCentavos)],
        ['Saldo do periodo', this.formatMoneyCentavos(dados.resumo.saldoPeriodoCentavos)],
        ['A receber aberto', this.formatMoneyCentavos(dados.resumo.receberAbertoCentavos)],
        ['A pagar aberto', this.formatMoneyCentavos(dados.resumo.pagarAbertoCentavos)],
        ['Despesas fixas ativas', this.formatMoneyCentavos(dados.resumo.despesasFixasCentavos)],
        ['Pro-labore', this.formatMoneyCentavos(dados.resumo.proLaboreCentavos)],
        ['Titulos vencidos', String(dados.resumo.titulosVencidos)],
        ['Anexos probatorios', String(dados.resumo.quantidadeAnexos)],
      ],
    );

    pdf.addSection('Livro caixa');
    pdf.addTable(
      ['Data', 'Tipo', 'Descricao', 'Conta', 'Categoria', 'Valor'],
      dados.movimentos.map((movimento) => [
        this.formatDate(movimento.dataMovimento),
        movimento.tipo,
        movimento.descricao,
        this.refNome(movimento.contaId),
        this.refNome(movimento.categoriaId),
        this.formatMoney(movimento.valor),
      ]),
    );

    pdf.addSection('Titulos financeiros');
    pdf.addTable(
      ['Vencimento', 'Tipo', 'Descricao', 'Status', 'Aberto'],
      dados.titulos.map((titulo) => [
        this.formatDate(titulo.dataVencimento),
        titulo.tipo,
        titulo.descricao,
        titulo.status,
        this.formatMoneyCentavos(this.valorAbertoTituloCentavos(titulo)),
      ]),
    );

    pdf.addSection('Anexos probatorios');
    pdf.addTable(
      ['Data', 'Descricao', 'Arquivo', 'SHA-256'],
      dados.anexos.map((anexo) => [
        this.formatDate(anexo.dataReferencia),
        anexo.descricao || '-',
        anexo.nomeOriginal,
        String(anexo.hashSha256).slice(0, 20),
      ]),
    );
    pdf.addWrapped('Hashes completos e URLs dos anexos estao disponiveis no arquivo Excel e na lista de anexos do fechamento mensal.');

    await this.registrarAuditoriaRelatorio(dados.periodo, 'pdf', actorId, actorEmpresaId);
    return pdf.build();
  }

  async gerarRelatorioMensalXlsx(query: RelatorioMensalFinanceiroQueryDto = {}, actorId?: string, actorEmpresaId?: string) {
    const dados = await this.getRelatorioMensalDados(query, actorEmpresaId);
    const sheets: SimpleXlsxSheet[] = [
      {
        name: 'Resumo',
        rows: [
          ['Relatorio financeiro mensal'],
          ['Empresa', dados.empresa?.nomeFantasia || dados.empresa?.razaoSocial || '-'],
          ['CNPJ', dados.empresa?.cnpj || '-'],
          ['Competencia', dados.periodo.competencia],
          ['Periodo inicio', this.formatDate(dados.periodo.inicio)],
          ['Periodo fim', this.formatDate(dados.periodo.fim)],
          ['Gerado em', this.formatDateTime(new Date())],
          [],
          ['Indicador', 'Valor'],
          ['Saldo em contas', dados.resumo.saldoContasCentavos / 100],
          ['Entradas', dados.resumo.entradasCentavos / 100],
          ['Saidas', dados.resumo.saidasCentavos / 100],
          ['Saldo do periodo', dados.resumo.saldoPeriodoCentavos / 100],
          ['A receber aberto', dados.resumo.receberAbertoCentavos / 100],
          ['A pagar aberto', dados.resumo.pagarAbertoCentavos / 100],
          ['Despesas fixas ativas', dados.resumo.despesasFixasCentavos / 100],
          ['Pro-labore', dados.resumo.proLaboreCentavos / 100],
          ['Titulos vencidos', dados.resumo.titulosVencidos],
          ['Movimentos', dados.resumo.quantidadeMovimentos],
          ['Anexos probatorios', dados.resumo.quantidadeAnexos],
        ],
      },
      {
        name: 'Movimentos',
        rows: [
          ['Data', 'Tipo', 'Descricao', 'Conta', 'Categoria', 'Forma pagamento', 'Valor', 'Origem', 'Observacoes'],
          ...dados.movimentos.map((movimento) => [
            this.formatDate(movimento.dataMovimento),
            movimento.tipo,
            movimento.descricao,
            this.refNome(movimento.contaId),
            this.refNome(movimento.categoriaId),
            movimento.formaPagamento,
            dinheiroParaCentavos(movimento.valor) / 100,
            movimento.origemTipo || '-',
            movimento.observacoes || '-',
          ]),
        ],
      },
      {
        name: 'Titulos',
        rows: [
          ['Competencia', 'Vencimento', 'Pagamento', 'Tipo', 'Descricao', 'Categoria', 'Conta', 'Total', 'Pago', 'Aberto', 'Status', 'Documento', 'Origem'],
          ...dados.titulos.map((titulo) => [
            this.formatDate(titulo.dataCompetencia),
            this.formatDate(titulo.dataVencimento),
            this.formatDate(titulo.dataPagamento),
            titulo.tipo,
            titulo.descricao,
            this.refNome(titulo.categoriaId),
            this.refNome(titulo.contaId),
            dinheiroParaCentavos(titulo.valorTotal) / 100,
            dinheiroParaCentavos(titulo.valorPago) / 100,
            this.valorAbertoTituloCentavos(titulo) / 100,
            titulo.status,
            titulo.documentoNumero || '-',
            titulo.origemTipo || '-',
          ]),
        ],
      },
      {
        name: 'Despesas fixas',
        rows: [
          ['Descricao', 'Categoria', 'Conta', 'Valor', 'Frequencia', 'Dia vencimento', 'Proxima competencia', 'Status', 'Documento'],
          ...dados.recorrencias.map((recorrencia) => [
            recorrencia.descricao,
            this.refNome(recorrencia.categoriaId),
            this.refNome(recorrencia.contaId),
            dinheiroParaCentavos(recorrencia.valor) / 100,
            recorrencia.frequencia,
            recorrencia.diaVencimento,
            this.formatDate(recorrencia.proximaCompetencia),
            recorrencia.status,
            recorrencia.documentoNumero || '-',
          ]),
        ],
      },
      {
        name: 'Anexos',
        rows: [
          ['Data referencia', 'Descricao', 'Vinculo', 'Arquivo original', 'Mime type', 'Tamanho bytes', 'URL', 'SHA-256'],
          ...dados.anexos.map((anexo) => [
            this.formatDate(anexo.dataReferencia),
            anexo.descricao || '-',
            anexo.vinculoTipo,
            anexo.nomeOriginal,
            anexo.mimeType,
            anexo.tamanhoBytes,
            anexo.urlArquivo,
            anexo.hashSha256,
          ]),
        ],
      },
    ];

    await this.registrarAuditoriaRelatorio(dados.periodo, 'xlsx', actorId, actorEmpresaId);
    return buildSimpleXlsx(sheets);
  }

  findAllAnexos(query: ListAnexosFinanceirosQueryDto = {}, actorEmpresaId?: string) {
    const empresaId = this.requireEmpresaId(actorEmpresaId);
    const periodo = this.montarPeriodoRelatorio({
      competencia: query.competencia,
      inicio: query.inicio,
      fim: query.fim,
    });
    const filtro: Record<string, unknown> = this.getEmpresaQuery(empresaId, {
      ativo: true,
      dataReferencia: { $gte: periodo.inicio, $lte: periodo.fim },
    });
    if (query.vinculoTipo) filtro.vinculoTipo = query.vinculoTipo;
    if (query.vinculoId) filtro.vinculoId = this.toObjectId(query.vinculoId, 'vinculoId');

    return this.anexoModel
      .find(filtro)
      .populate('enviadoPor', 'nome email')
      .sort({ dataReferencia: -1, criadoEm: -1 })
      .lean()
      .exec();
  }

  async createAnexo(dto: CreateAnexoFinanceiroDto, file: UploadedFinanceiroFile | undefined, actorId?: string, actorEmpresaId?: string) {
    if (!file) {
      throw new BadRequestException('Arquivo do anexo e obrigatorio.');
    }

    const empresaId = actorEmpresaId ?? dto.empresaId;
    this.assertEmpresaPermitida(empresaId, actorEmpresaId);
    const empresaIdObrigatoria = this.requireEmpresaId(empresaId);
    const periodo = this.montarPeriodoRelatorio({
      competencia: dto.competencia,
      inicio: dto.periodoInicio,
      fim: dto.periodoFim,
    });
    const hashSha256 = createHash('sha256').update(readFileSync(file.path)).digest('hex');
    const anexo = await this.anexoModel.create({
      empresaId: this.toObjectId(empresaIdObrigatoria, 'empresaId'),
      competencia: dto.competencia ?? periodo.competencia,
      periodoInicio: periodo.inicio,
      periodoFim: periodo.fim,
      vinculoTipo: dto.vinculoTipo ?? ANEXO_FINANCEIRO_VINCULO_TIPO.FECHAMENTO_MENSAL,
      vinculoId: this.toOptionalObjectId(dto.vinculoId, 'vinculoId'),
      descricao: dto.descricao,
      nomeOriginal: file.originalname,
      nomeArquivo: file.filename,
      mimeType: file.mimetype,
      tamanhoBytes: file.size,
      urlArquivo: `/uploads/financeiro-provas/${file.filename}`,
      hashSha256,
      dataReferencia: dto.dataReferencia ? this.toDate(dto.dataReferencia, 'dataReferencia') : new Date(),
      enviadoPor: actorId ? this.toObjectId(actorId, 'usuarioId') : undefined,
      ativo: true,
    });

    await this.registrarAuditoria(anexo, actorId, AUDITORIA_EVENTOS.ANEXO_FINANCEIRO_ADICIONADO, AUDITORIA_ENTIDADES.ANEXO_FINANCEIRO, {
      descricao: anexo.descricao,
      nomeOriginal: anexo.nomeOriginal,
      hashSha256,
      competencia: anexo.competencia,
    });

    return anexo;
  }

  async removeAnexo(id: string, actorId?: string, actorEmpresaId?: string) {
    const update: Record<string, unknown> = {
      ativo: false,
      removidoEm: new Date(),
    };
    if (actorId) {
      update.removidoPor = this.toObjectId(actorId, 'usuarioId');
    }

    const anexo = await this.anexoModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), update, { new: true })
      .exec();

    if (!anexo) {
      throw new NotFoundException('Anexo financeiro nao encontrado.');
    }

    await this.registrarAuditoria(anexo, actorId, AUDITORIA_EVENTOS.ANEXO_FINANCEIRO_REMOVIDO, AUDITORIA_ENTIDADES.ANEXO_FINANCEIRO, {
      descricao: anexo.descricao,
      nomeOriginal: anexo.nomeOriginal,
      hashSha256: anexo.hashSha256,
      operacao: 'inativado',
    });

    return anexo;
  }

  async sincronizarTituloVenda(venda: any, actorId?: string, actorEmpresaId?: string) {
    const empresaId = venda.empresaId?.toString();
    const vendaId = venda._id?.toString();
    if (!empresaId || !vendaId) {
      throw new BadRequestException('Venda invalida para sincronizacao financeira.');
    }

    this.assertEmpresaPermitida(empresaId, actorEmpresaId);

    if (venda.statusFinanceiro === 'cancelado') {
      return this.cancelarTituloPorOrigem(empresaId, 'venda', vendaId, actorId, actorEmpresaId);
    }

    const categoria = await this.getOuCriarCategoriaIntegracao(
      empresaId,
      CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      'Vendas',
      'receitas_operacionais',
      actorId,
    );

    return this.upsertTituloIntegracao({
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
      categoriaId: (categoria._id as Types.ObjectId).toString(),
      descricao: `Venda ${this.shortId(vendaId)}`,
      valorTotal: venda.total,
      dataCompetencia: venda.criadoEm ?? venda.createdAt ?? new Date(),
      dataVencimento: venda.criadoEm ?? venda.createdAt ?? new Date(),
      contraparteTipo: 'cliente',
      contraparteId: venda.clienteId?.toString(),
      origemTipo: 'venda',
      origemId: vendaId,
      observacoes: 'Titulo gerado automaticamente pela venda.',
    }, actorId, actorEmpresaId);
  }

  async sincronizarTituloCompraPedido(pedido: any, total: unknown, actorId?: string, actorEmpresaId?: string) {
    const empresaId = pedido.empresaId?.toString();
    const pedidoId = pedido._id?.toString();
    if (!empresaId || !pedidoId) {
      throw new BadRequestException('Pedido de compra invalido para sincronizacao financeira.');
    }

    this.assertEmpresaPermitida(empresaId, actorEmpresaId);

    if (this.isStatusCancelado(pedido.status)) {
      return this.cancelarTituloPorOrigem(empresaId, 'pedido_compra', pedidoId, actorId, actorEmpresaId);
    }

    const totalCentavos = dinheiroParaCentavos(total);
    if (!Number.isFinite(totalCentavos) || totalCentavos <= 0) {
      return this.cancelarTituloPorOrigem(empresaId, 'pedido_compra', pedidoId, actorId, actorEmpresaId);
    }

    const categoria = await this.getOuCriarCategoriaIntegracao(
      empresaId,
      CATEGORIA_FINANCEIRA_TIPO.SAIDA,
      'Compras de fornecedor',
      'fornecedores',
      actorId,
      true,
    );

    return this.upsertTituloIntegracao({
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.PAGAR,
      categoriaId: (categoria._id as Types.ObjectId).toString(),
      descricao: `Compra ${this.shortId(pedidoId)}`,
      valorTotal: centavosParaDecimal128(totalCentavos),
      dataCompetencia: pedido.criadoEm ?? pedido.createdAt ?? new Date(),
      dataVencimento: pedido.criadoEm ?? pedido.createdAt ?? new Date(),
      contraparteTipo: 'fornecedor',
      contraparteId: pedido.fornecedorId?.toString(),
      origemTipo: 'pedido_compra',
      origemId: pedidoId,
      observacoes: 'Titulo gerado automaticamente pelo pedido de compra.',
    }, actorId, actorEmpresaId);
  }

  async registrarPagamentoVenda(pagamento: any, venda: any, actorId?: string, actorEmpresaId?: string, contaFinanceiraId?: string) {
    const empresaId = venda.empresaId?.toString();
    const pagamentoId = pagamento._id?.toString();
    if (!empresaId || !pagamentoId) {
      throw new BadRequestException('Pagamento invalido para sincronizacao financeira.');
    }

    this.assertEmpresaPermitida(empresaId, actorEmpresaId);

    const movimentoExistente = await this.movimentoModel.findOne({
      empresaId,
      origemTipo: 'pagamento_venda',
      origemId: pagamento._id,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    }).exec();

    if (movimentoExistente) {
      const tituloExistente = movimentoExistente.tituloId
        ? await this.getTituloDaEmpresa(movimentoExistente.tituloId.toString(), actorEmpresaId)
        : null;
      return { titulo: tituloExistente, movimento: movimentoExistente };
    }

    const titulo = await this.sincronizarTituloVenda(venda, actorId, actorEmpresaId);
    if (!titulo) {
      throw new BadRequestException('Titulo financeiro da venda nao encontrado para baixa.');
    }

    const conta = contaFinanceiraId
      ? await this.getContaDaEmpresa(contaFinanceiraId, actorEmpresaId)
      : await this.getOuCriarContaIntegracao(empresaId, pagamento.formaPagamento, actorId);

    return this.baixarTituloComMovimento({
      titulo,
      contaId: (conta._id as Types.ObjectId).toString(),
      valor: pagamento.valor,
      dataPagamento: pagamento.dataPagamento ?? new Date(),
      formaPagamento: normalizarFormaPagamentoFinanceiro(pagamento.formaPagamento ?? ''),
      origemTipo: 'pagamento_venda',
      origemId: pagamentoId,
      descricao: `Pagamento da venda ${this.shortId(venda._id?.toString())}`,
      observacoes: 'Baixa gerada automaticamente pelo pagamento da venda.',
    }, actorId, actorEmpresaId);
  }

  async estornarPagamentoVenda(pagamento: any, actorId?: string, actorEmpresaId?: string, motivo?: string) {
    const pagamentoId = pagamento._id?.toString();
    if (!pagamentoId) {
      return null;
    }

    const movimentoId = pagamento.movimentoCaixaId?.toString();
    const movimento = movimentoId
      ? await this.movimentoModel.findOne(this.getEmpresaQuery(actorEmpresaId, { _id: movimentoId })).exec()
      : await this.movimentoModel.findOne(this.getEmpresaQuery(actorEmpresaId, {
        origemTipo: 'pagamento_venda',
        origemId: pagamento._id,
        status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
      })).exec();

    if (!movimento || movimento.status === MOVIMENTO_CAIXA_STATUS.ESTORNADO) {
      return null;
    }

    const movimentoParaEstornoId = movimento._id?.toString();
    if (!movimentoParaEstornoId) {
      return null;
    }

    return this.estornarMovimento(movimentoParaEstornoId, { motivo }, actorId, actorEmpresaId);
  }

  async cancelarTituloPorOrigem(empresaId: string, origemTipo: string, origemId: string, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(empresaId, actorEmpresaId);

    const titulo = await this.tituloModel.findOne({
      empresaId,
      origemTipo,
      origemId: this.toObjectId(origemId, 'origemId'),
    }).exec();

    if (!titulo) {
      return null;
    }

    return this.cancelarTitulo(titulo._id?.toString(), actorId, actorEmpresaId);
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

  private async upsertTituloIntegracao(input: UpsertTituloIntegracaoInput, actorId?: string, actorEmpresaId?: string) {
    const valorTotalCentavos = dinheiroParaCentavos(input.valorTotal);
    if (!Number.isFinite(valorTotalCentavos) || valorTotalCentavos <= 0) {
      throw new BadRequestException('Valor total invalido para titulo financeiro integrado.');
    }

    await this.assertCategoriaPertenceTipo(input.categoriaId, actorEmpresaId, tituloTipoParaCategoriaTipo(input.tipo));

    const origemId = this.toObjectId(input.origemId, 'origemId');
    const existing = await this.tituloModel.findOne({
      empresaId: input.empresaId,
      origemTipo: input.origemTipo,
      origemId,
    }).exec();

    if (!existing) {
      return this.createTitulo({
        empresaId: input.empresaId,
        tipo: input.tipo,
        categoriaId: input.categoriaId,
        descricao: input.descricao,
        valorTotal: centavosParaString(valorTotalCentavos),
        dataCompetencia: this.toDate(input.dataCompetencia, 'dataCompetencia').toISOString(),
        dataVencimento: this.toDate(input.dataVencimento, 'dataVencimento').toISOString(),
        contraparteTipo: input.contraparteTipo,
        contraparteId: input.contraparteId,
        origemTipo: input.origemTipo,
        origemId: input.origemId,
        observacoes: input.observacoes,
      }, actorId, actorEmpresaId);
    }

    if (existing.status === TITULO_FINANCEIRO_STATUS.CANCELADO) {
      throw new BadRequestException('Titulo integrado ja foi cancelado.');
    }

    const valorPagoCentavos = dinheiroParaCentavos(existing.valorPago);
    if (valorTotalCentavos < valorPagoCentavos) {
      throw new BadRequestException('Valor integrado nao pode ser menor que o valor ja baixado.');
    }

    const status = calcularStatusTitulo(centavosParaDecimal128(valorTotalCentavos), existing.valorPago);
    const titulo = await this.tituloModel.findOneAndUpdate(
      { _id: existing._id, empresaId: input.empresaId },
      {
        categoriaId: this.toObjectId(input.categoriaId, 'categoriaId'),
        descricao: input.descricao,
        valorTotal: centavosParaDecimal128(valorTotalCentavos),
        dataCompetencia: this.toDate(input.dataCompetencia, 'dataCompetencia'),
        dataVencimento: this.toDate(input.dataVencimento, 'dataVencimento'),
        status,
        contraparteTipo: input.contraparteTipo,
        contraparteId: this.toOptionalObjectId(input.contraparteId, 'contraparteId'),
        observacoes: input.observacoes,
      },
      { new: true },
    ).exec();

    if (!titulo) {
      throw new NotFoundException('Titulo financeiro integrado nao encontrado.');
    }

    await this.registrarAuditoria(titulo, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_ATUALIZADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      origemTipo: input.origemTipo,
      origemId: input.origemId,
      valorTotal: centavosParaString(valorTotalCentavos),
      status,
    });

    return titulo;
  }

  private async baixarTituloComMovimento(input: BaixarTituloIntegradoInput, actorId?: string, actorEmpresaId?: string) {
    this.assertTituloPodeSerBaixado(input.titulo);

    const valorBaixaCentavos = dinheiroParaCentavos(input.valor);
    if (!Number.isFinite(valorBaixaCentavos) || valorBaixaCentavos <= 0) {
      throw new BadRequestException('Valor da baixa invalido.');
    }

    const valorPagoCentavos = dinheiroParaCentavos(input.titulo.valorPago);
    const valorTotalCentavos = dinheiroParaCentavos(input.titulo.valorTotal);
    if (valorPagoCentavos + valorBaixaCentavos > valorTotalCentavos) {
      throw new BadRequestException('Valor da baixa excede o saldo em aberto do titulo.');
    }

    const conta = await this.getContaDaEmpresa(input.contaId, actorEmpresaId);
    const movimento = await this.registrarMovimento({
      empresaId: input.titulo.empresaId,
      contaId: conta._id as Types.ObjectId,
      categoriaId: input.titulo.categoriaId,
      tituloId: input.titulo._id as Types.ObjectId,
      tipo: tituloTipoParaMovimentoTipo(input.titulo.tipo),
      descricao: input.descricao,
      valorCentavos: valorBaixaCentavos,
      dataMovimento: this.toDate(input.dataPagamento, 'dataPagamento'),
      formaPagamento: input.formaPagamento,
      origemTipo: input.origemTipo,
      origemId: input.origemId,
      observacoes: input.observacoes,
    }, actorId);

    const novoValorPagoCentavos = valorPagoCentavos + valorBaixaCentavos;
    const status = calcularStatusTitulo(input.titulo.valorTotal, centavosParaDecimal128(novoValorPagoCentavos));
    const tituloAtualizado = await this.atualizarPagamentoTitulo(
      (input.titulo._id as Types.ObjectId).toString(),
      novoValorPagoCentavos,
      status,
      status === TITULO_FINANCEIRO_STATUS.QUITADO ? this.toDate(input.dataPagamento, 'dataPagamento') : undefined,
      conta._id as Types.ObjectId,
      actorEmpresaId,
    );

    await this.registrarAuditoria(tituloAtualizado, actorId, AUDITORIA_EVENTOS.TITULO_FINANCEIRO_BAIXADO, AUDITORIA_ENTIDADES.TITULO_FINANCEIRO, {
      origemTipo: input.origemTipo,
      origemId: input.origemId,
      valorBaixa: centavosParaString(valorBaixaCentavos),
      status,
      movimentoId: movimento._id?.toString(),
    });

    return {
      titulo: tituloAtualizado,
      movimento,
    };
  }

  private async getOuCriarCategoriaIntegracao(
    empresaId: string,
    tipo: string,
    nome: string,
    grupo: string,
    actorId?: string,
    dedutivel = false,
  ) {
    const existing = await this.categoriaModel.findOne({ empresaId, tipo, nome }).exec();
    if (existing) {
      if (existing.ativo === false) {
        const reactivated = await this.categoriaModel.findByIdAndUpdate(existing._id, { ativo: true }, { new: true }).exec();
        if (!reactivated) {
          throw new NotFoundException('Categoria financeira de integracao nao encontrada.');
        }
        return reactivated;
      }

      return existing;
    }

    const categoria = await this.categoriaModel.create({
      empresaId: this.toObjectId(empresaId, 'empresaId'),
      nome,
      tipo,
      grupo,
      classificacao: CATEGORIA_FINANCEIRA_CLASSIFICACAO.EMPRESA,
      recorrente: false,
      dedutivel,
      ativo: true,
      observacoes: 'Categoria criada automaticamente pela integracao financeira.',
    });

    await this.registrarAuditoria(categoria, actorId, AUDITORIA_EVENTOS.CATEGORIA_FINANCEIRA_CRIADA, AUDITORIA_ENTIDADES.CATEGORIA_FINANCEIRA, {
      nome,
      tipo,
      origem: 'integracao',
    });

    return categoria;
  }

  private async getOuCriarContaIntegracao(empresaId: string, formaPagamento: string | undefined, actorId?: string) {
    const forma = normalizarFormaPagamentoFinanceiro(formaPagamento ?? '');
    const nome = forma === FORMA_PAGAMENTO_FINANCEIRO.DINHEIRO ? 'Caixa Geral' : 'Conta Financeira Padrao';
    const tipo = forma === FORMA_PAGAMENTO_FINANCEIRO.DINHEIRO
      ? CONTA_FINANCEIRA_TIPO.CAIXA
      : CONTA_FINANCEIRA_TIPO.CONTA_BANCARIA;

    const existing = await this.contaModel.findOne({ empresaId, nome }).exec();
    if (existing) {
      if (existing.ativo === false) {
        const reactivated = await this.contaModel.findByIdAndUpdate(existing._id, { ativo: true }, { new: true }).exec();
        if (!reactivated) {
          throw new NotFoundException('Conta financeira de integracao nao encontrada.');
        }
        return reactivated;
      }

      return existing;
    }

    const conta = await this.contaModel.create({
      empresaId: this.toObjectId(empresaId, 'empresaId'),
      nome,
      tipo,
      saldoInicial: centavosParaDecimal128(0),
      saldoAtual: centavosParaDecimal128(0),
      moeda: 'BRL',
      ativo: true,
      observacoes: 'Conta criada automaticamente pela integracao financeira.',
    });

    await this.registrarAuditoria(conta, actorId, AUDITORIA_EVENTOS.CONTA_FINANCEIRA_CRIADA, AUDITORIA_ENTIDADES.CONTA_FINANCEIRA, {
      nome,
      tipo,
      origem: 'integracao',
    });

    return conta;
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

  private montarPeriodoRelatorio(query: RelatorioMensalFinanceiroQueryDto = {}): PeriodoRelatorio {
    if (query.competencia) {
      const [yearText, monthText] = query.competencia.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new BadRequestException('Competencia invalida. Use o formato YYYY-MM.');
      }

      return {
        competencia: query.competencia,
        inicio: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
        fim: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
      };
    }

    const now = new Date();
    const inicio = query.inicio
      ? this.inicioDoDia(this.toDate(query.inicio, 'inicio'))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const fim = query.fim
      ? this.fimDoDia(this.toDate(query.fim, 'fim'))
      : new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    if (fim < inicio) {
      throw new BadRequestException('Data final nao pode ser anterior a data inicial.');
    }

    return {
      competencia: `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`,
      inicio,
      fim,
    };
  }

  private inicioDoDia(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  }

  private fimDoDia(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  }

  private dateToInput(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private isTituloAberto(status?: string) {
    return status === TITULO_FINANCEIRO_STATUS.ABERTO || status === TITULO_FINANCEIRO_STATUS.PARCIAL;
  }

  private valorAbertoTituloCentavos(titulo: { valorTotal?: unknown; valorPago?: unknown }) {
    return Math.max(0, dinheiroParaCentavos(titulo.valorTotal) - dinheiroParaCentavos(titulo.valorPago));
  }

  private isCategoriaProLabore(categoria: unknown) {
    const record = categoria && typeof categoria === 'object' ? categoria as Record<string, unknown> : {};
    const nome = String(record.nome ?? '');
    const grupo = String(record.grupo ?? '');
    return this.normalizarBusca(nome).includes('prolabore') || this.normalizarBusca(grupo).includes('prolabore');
  }

  private normalizarBusca(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private formatDate(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private formatDateTime(value: Date) {
    return value.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private formatMoney(value: unknown) {
    return this.formatMoneyCentavos(dinheiroParaCentavos(value));
  }

  private formatMoneyCentavos(centavos: number) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private refNome(value: unknown) {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.nome === 'string') return record.nome;
      if (record._id) return String(record._id);
    }

    return value ? String(value) : '-';
  }

  private requireEmpresaId(empresaId?: string) {
    if (!empresaId) {
      throw new BadRequestException('Empresa do usuario autenticado e obrigatoria para esta operacao.');
    }

    return empresaId;
  }

  private async registrarAuditoriaRelatorio(periodo: PeriodoRelatorio, formato: string, actorId?: string, actorEmpresaId?: string) {
    if (!actorId || !actorEmpresaId) {
      return;
    }

    await this.registrarAuditoria(
      {
        _id: new Types.ObjectId(),
        empresaId: this.toObjectId(actorEmpresaId, 'empresaId'),
      },
      actorId,
      AUDITORIA_EVENTOS.RELATORIO_FINANCEIRO_GERADO,
      AUDITORIA_ENTIDADES.RELATORIO_FINANCEIRO,
      {
        formato,
        competencia: periodo.competencia,
        inicio: periodo.inicio,
        fim: periodo.fim,
      },
    );
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

  private isStatusCancelado(status?: string) {
    const normalized = String(status ?? '').trim().toLowerCase();
    return ['cancelado', 'cancelada', 'cancelled', 'canceled'].includes(normalized);
  }

  private shortId(id?: string) {
    return String(id ?? '').slice(-8).toUpperCase();
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
