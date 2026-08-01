import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FinanceiroAdmService } from './financeiro-adm.service';
import {
  CATEGORIA_FINANCEIRA_TIPO,
  FORMA_PAGAMENTO_FINANCEIRO,
  MOVIMENTO_CAIXA_STATUS,
  MOVIMENTO_CAIXA_TIPO,
  TITULO_FINANCEIRO_STATUS,
  TITULO_FINANCEIRO_TIPO,
} from './financeiro-adm.types';
import { FECHAMENTO_MENSAL_STATUS } from './schemas/fechamento-mensal-financeiro.schema';

function execResult<T>(result: T) {
  return {
    exec: jest.fn().mockResolvedValue(result),
  };
}

function chainResult<T>(result: T) {
  const chain: any = {
    exec: jest.fn().mockResolvedValue(result),
  };
  chain.populate = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockReturnValue(chain);
  return chain;
}

describe('FinanceiroAdmService', () => {
  const createService = () => {
    const contaModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
    };
    const categoriaModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
    };
    const tituloModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    const movimentoModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
    };
    const recorrenciaModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    const anexoModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    const fechamentoModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn().mockReturnValue(execResult(null)),
      findOneAndUpdate: jest.fn(),
    };
    const empresaModel = {
      findById: jest.fn(),
    };
    const auditoriaService = {
      registrarEventoNegocio: jest.fn().mockResolvedValue(undefined),
    };

    const service = new FinanceiroAdmService(
      contaModel as never,
      categoriaModel as never,
      tituloModel as never,
      movimentoModel as never,
      recorrenciaModel as never,
      anexoModel as never,
      fechamentoModel as never,
      empresaModel as never,
      auditoriaService as never,
    );

    return {
      service,
      contaModel,
      categoriaModel,
      tituloModel,
      movimentoModel,
      recorrenciaModel,
      anexoModel,
      fechamentoModel,
      empresaModel,
      auditoriaService,
    };
  };

  it('baixa titulo a pagar gerando saida e atualizando saldo e titulo', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const tituloId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const usuarioId = new Types.ObjectId().toString();
    const conta = {
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('500.00'),
    };
    const categoria = {
      _id: categoriaId,
      empresaId,
      tipo: CATEGORIA_FINANCEIRA_TIPO.SAIDA,
      ativo: true,
    };
    const titulo = {
      _id: tituloId,
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.PAGAR,
      categoriaId,
      descricao: 'Internet',
      valorTotal: Types.Decimal128.fromString('100.00'),
      valorPago: Types.Decimal128.fromString('0.00'),
      status: TITULO_FINANCEIRO_STATUS.ABERTO,
    };
    const movimento = {
      _id: movimentoId,
      empresaId,
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      descricao: 'Baixa - Internet',
      valor: Types.Decimal128.fromString('100.00'),
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.PIX,
    };
    const tituloAtualizado = {
      ...titulo,
      valorPago: Types.Decimal128.fromString('100.00'),
      status: TITULO_FINANCEIRO_STATUS.QUITADO,
    };
    const { service, contaModel, categoriaModel, tituloModel, movimentoModel } = createService();

    tituloModel.findOne.mockReturnValue(execResult(titulo));
    contaModel.findOne.mockReturnValue(execResult(conta));
    categoriaModel.findOne.mockReturnValue(execResult(categoria));
    movimentoModel.create.mockResolvedValue(movimento);
    contaModel.findOneAndUpdate.mockReturnValue(execResult({
      ...conta,
      saldoAtual: Types.Decimal128.fromString('400.00'),
    }));
    tituloModel.findOneAndUpdate.mockReturnValue(execResult(tituloAtualizado));

    const result = await service.baixarTitulo(tituloId.toString(), {
      contaId: contaId.toString(),
      valor: '100.00',
      dataPagamento: '2026-08-01',
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.PIX,
    }, usuarioId, empresaId.toString());

    expect(movimentoModel.create).toHaveBeenCalledWith(expect.objectContaining({
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      descricao: 'Baixa - Internet',
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    }));
    expect(movimentoModel.create.mock.calls[0][0].valor.toString()).toBe('100.00');
    expect(contaModel.findOneAndUpdate.mock.calls[0][1].saldoAtual.toString()).toBe('400.00');
    expect(tituloModel.findOneAndUpdate.mock.calls[0][1].$set.valorPago.toString()).toBe('100.00');
    expect(tituloModel.findOneAndUpdate.mock.calls[0][1].$set.status).toBe(TITULO_FINANCEIRO_STATUS.QUITADO);
    expect(result.titulo).toBe(tituloAtualizado);
    expect(result.movimento).toBe(movimento);
  });

  it('bloqueia movimento com categoria incompativel', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const { service, contaModel, categoriaModel, movimentoModel } = createService();

    contaModel.findOne.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('0.00'),
    }));
    categoriaModel.findOne.mockReturnValue(execResult({
      _id: categoriaId,
      empresaId,
      tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      ativo: true,
    }));

    await expect(service.createMovimento({
      empresaId: empresaId.toString(),
      contaId: contaId.toString(),
      categoriaId: categoriaId.toString(),
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      descricao: 'Despesa',
      valor: '20.00',
      dataMovimento: '2026-08-01',
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.PIX,
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);
    expect(movimentoModel.create).not.toHaveBeenCalled();
  });

  it('totaliza livro caixa por entradas e saidas confirmadas', async () => {
    const empresaId = new Types.ObjectId().toString();
    const { service, movimentoModel } = createService();
    movimentoModel.find.mockReturnValue(chainResult([
      { tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA, valor: Types.Decimal128.fromString('100.00') },
      { tipo: MOVIMENTO_CAIXA_TIPO.SAIDA, valor: Types.Decimal128.fromString('30.00') },
    ]));

    const result = await service.getLivroCaixa(empresaId, { inicio: '2026-08-01', fim: '2026-08-31' });

    expect(movimentoModel.find).toHaveBeenCalledWith({
      empresaId,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
      dataMovimento: {
        $gte: new Date('2026-08-01'),
        $lte: new Date('2026-08-31'),
      },
    });
    expect(result.totalEntradas).toBe('100.00');
    expect(result.totalSaidas).toBe('30.00');
    expect(result.saldoPeriodo).toBe('70.00');
  });

  it('sincroniza venda criando categoria padrao e titulo a receber', async () => {
    const empresaId = new Types.ObjectId();
    const vendaId = new Types.ObjectId();
    const clienteId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const tituloId = new Types.ObjectId();
    const categoria = {
      _id: categoriaId,
      empresaId,
      nome: 'Vendas',
      tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      ativo: true,
    };
    const titulo = {
      _id: tituloId,
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
      categoriaId,
      origemTipo: 'venda',
      origemId: vendaId,
      valorTotal: Types.Decimal128.fromString('250.00'),
      valorPago: Types.Decimal128.fromString('0.00'),
      status: TITULO_FINANCEIRO_STATUS.ABERTO,
    };
    const { service, categoriaModel, tituloModel } = createService();
    categoriaModel.findOne
      .mockReturnValueOnce(execResult(null))
      .mockReturnValueOnce(execResult(categoria))
      .mockReturnValueOnce(execResult(categoria));
    categoriaModel.create.mockResolvedValue(categoria);
    tituloModel.findOne.mockReturnValue(execResult(null));
    tituloModel.create.mockResolvedValue(titulo);

    const result = await service.sincronizarTituloVenda({
      _id: vendaId,
      empresaId,
      clienteId,
      total: Types.Decimal128.fromString('250.00'),
      criadoEm: new Date('2026-08-01'),
      statusFinanceiro: 'pendente',
    }, new Types.ObjectId().toString(), empresaId.toString());

    expect(categoriaModel.create).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Vendas',
      tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      grupo: 'receitas_operacionais',
    }));
    expect(tituloModel.create).toHaveBeenCalledWith(expect.objectContaining({
      tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
      descricao: `Venda ${vendaId.toString().slice(-8).toUpperCase()}`,
      origemTipo: 'venda',
    }));
    expect(tituloModel.create.mock.calls[0][0].valorTotal.toString()).toBe('250.00');
    expect(result).toBe(titulo);
  });

  it('registra pagamento de venda baixando titulo e gerando entrada no caixa', async () => {
    const empresaId = new Types.ObjectId();
    const vendaId = new Types.ObjectId();
    const pagamentoId = new Types.ObjectId();
    const clienteId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const tituloId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const categoria = {
      _id: categoriaId,
      empresaId,
      nome: 'Vendas',
      tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      ativo: true,
    };
    const conta = {
      _id: contaId,
      empresaId,
      nome: 'Caixa Geral',
      saldoAtual: Types.Decimal128.fromString('10.00'),
      ativo: true,
    };
    const titulo = {
      _id: tituloId,
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
      categoriaId,
      descricao: 'Venda',
      origemTipo: 'venda',
      origemId: vendaId,
      valorTotal: Types.Decimal128.fromString('100.00'),
      valorPago: Types.Decimal128.fromString('0.00'),
      status: TITULO_FINANCEIRO_STATUS.ABERTO,
    };
    const tituloAtualizado = {
      ...titulo,
      valorPago: Types.Decimal128.fromString('100.00'),
      status: TITULO_FINANCEIRO_STATUS.QUITADO,
    };
    const movimento = {
      _id: movimentoId,
      empresaId,
      contaId,
      tituloId,
      tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
      valor: Types.Decimal128.fromString('100.00'),
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.DINHEIRO,
    };
    const { service, contaModel, categoriaModel, tituloModel, movimentoModel } = createService();

    movimentoModel.findOne.mockReturnValue(execResult(null));
    categoriaModel.findOne
      .mockReturnValueOnce(execResult(categoria))
      .mockReturnValueOnce(execResult(categoria));
    tituloModel.findOne.mockReturnValue(execResult(titulo));
    contaModel.findOne
      .mockReturnValueOnce(execResult(conta))
      .mockReturnValueOnce(execResult(conta))
      .mockReturnValueOnce(execResult(conta));
    movimentoModel.create.mockResolvedValue(movimento);
    contaModel.findOneAndUpdate.mockReturnValue(execResult({
      ...conta,
      saldoAtual: Types.Decimal128.fromString('110.00'),
    }));
    tituloModel.findOneAndUpdate
      .mockReturnValueOnce(execResult(titulo))
      .mockReturnValueOnce(execResult(tituloAtualizado));

    const result = await service.registrarPagamentoVenda({
      _id: pagamentoId,
      vendaId,
      formaPagamento: 'dinheiro',
      valor: Types.Decimal128.fromString('100.00'),
      dataPagamento: new Date('2026-08-01'),
    }, {
      _id: vendaId,
      empresaId,
      clienteId,
      total: Types.Decimal128.fromString('100.00'),
      criadoEm: new Date('2026-08-01'),
      statusFinanceiro: 'pendente',
    }, new Types.ObjectId().toString(), empresaId.toString());

    expect(movimentoModel.create).toHaveBeenCalledWith(expect.objectContaining({
      tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
      origemTipo: 'pagamento_venda',
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    }));
    expect(movimentoModel.create.mock.calls[0][0].valor.toString()).toBe('100.00');
    expect(contaModel.findOneAndUpdate.mock.calls[0][1].saldoAtual.toString()).toBe('110.00');
    expect(result.titulo).toBe(tituloAtualizado);
    expect(result.movimento).toBe(movimento);
  });

  it('monta relatorio mensal com resumo financeiro e anexos probatorios', async () => {
    const empresaId = new Types.ObjectId().toString();
    const { service, empresaModel, contaModel, categoriaModel, tituloModel, movimentoModel, recorrenciaModel, anexoModel } = createService();

    empresaModel.findById.mockReturnValue(chainResult({
      _id: empresaId,
      nomeFantasia: 'Mantec',
      cnpj: '00.000.000/0001-00',
    }));
    contaModel.find.mockReturnValue(chainResult([
      { saldoAtual: Types.Decimal128.fromString('500.00') },
    ]));
    categoriaModel.find.mockReturnValue(chainResult([
      { nome: 'Vendas', tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA },
      { nome: 'Pro-labore', tipo: CATEGORIA_FINANCEIRA_TIPO.SAIDA, grupo: 'prolabore' },
    ]));
    movimentoModel.find.mockReturnValue(chainResult([
      {
        tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
        valor: Types.Decimal128.fromString('1000.00'),
        categoriaId: { nome: 'Vendas', grupo: 'receitas' },
      },
      {
        tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
        valor: Types.Decimal128.fromString('150.00'),
        categoriaId: { nome: 'Pro-labore', grupo: 'prolabore' },
      },
    ]));
    tituloModel.find.mockReturnValue(chainResult([
      {
        tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
        valorTotal: Types.Decimal128.fromString('300.00'),
        valorPago: Types.Decimal128.fromString('100.00'),
        status: TITULO_FINANCEIRO_STATUS.PARCIAL,
        dataVencimento: new Date('2026-08-20'),
      },
      {
        tipo: TITULO_FINANCEIRO_TIPO.PAGAR,
        valorTotal: Types.Decimal128.fromString('80.00'),
        valorPago: Types.Decimal128.fromString('0.00'),
        status: TITULO_FINANCEIRO_STATUS.ABERTO,
        dataVencimento: new Date('2026-08-21'),
      },
    ]));
    recorrenciaModel.find.mockReturnValue(chainResult([
      {
        tipoTitulo: TITULO_FINANCEIRO_TIPO.PAGAR,
        valor: Types.Decimal128.fromString('80.00'),
      },
    ]));
    anexoModel.find.mockReturnValue(chainResult([
      {
        nomeOriginal: 'comprovante.pdf',
        hashSha256: 'abc123',
        dataReferencia: new Date('2026-08-01'),
      },
    ]));

    const result = await service.getRelatorioMensalDados({ competencia: '2026-08' }, empresaId);

    expect(result.periodo.competencia).toBe('2026-08');
    expect(result.resumo.entradasCentavos).toBe(100000);
    expect(result.resumo.saidasCentavos).toBe(15000);
    expect(result.resumo.saldoPeriodoCentavos).toBe(85000);
    expect(result.resumo.receberAbertoCentavos).toBe(20000);
    expect(result.resumo.pagarAbertoCentavos).toBe(8000);
    expect(result.resumo.proLaboreCentavos).toBe(15000);
    expect(result.resumo.quantidadeAnexos).toBe(1);
  });

  it('fecha competencia mensal salvando snapshot e hash', async () => {
    const empresaId = new Types.ObjectId();
    const fechamentoId = new Types.ObjectId();
    const usuarioId = new Types.ObjectId().toString();
    const { service, empresaModel, contaModel, categoriaModel, tituloModel, movimentoModel, recorrenciaModel, anexoModel, fechamentoModel } = createService();

    empresaModel.findById.mockReturnValue(chainResult({
      _id: empresaId,
      nomeFantasia: 'Mantec',
      cnpj: '00.000.000/0001-00',
    }));
    contaModel.find.mockReturnValue(chainResult([{ _id: new Types.ObjectId(), nome: 'Caixa', tipo: 'caixa', saldoAtual: Types.Decimal128.fromString('100.00') }]));
    categoriaModel.find.mockReturnValue(chainResult([{ nome: 'Vendas', tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA }]));
    movimentoModel.find.mockReturnValue(chainResult([]));
    tituloModel.find.mockReturnValue(chainResult([]));
    recorrenciaModel.find.mockReturnValue(chainResult([]));
    anexoModel.find.mockReturnValue(chainResult([]));
    fechamentoModel.findOne.mockReturnValue(execResult(null));
    fechamentoModel.findOneAndUpdate.mockReturnValue(execResult({
      _id: fechamentoId,
      empresaId,
      competencia: '2026-08',
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
      snapshotHashSha256: 'hash',
    }));

    const result = await service.fecharMesFinanceiro({ competencia: '2026-08' }, usuarioId, empresaId.toString());

    expect(fechamentoModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ competencia: '2026-08' }),
      expect.objectContaining({
        status: FECHAMENTO_MENSAL_STATUS.FECHADO,
        competencia: '2026-08',
        snapshotHashSha256: expect.any(String),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(result?.status).toBe(FECHAMENTO_MENSAL_STATUS.FECHADO);
  });

  it('bloqueia movimento em competencia fechada', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const { service, contaModel, categoriaModel, movimentoModel, fechamentoModel } = createService();

    contaModel.findOne.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('0.00'),
    }));
    categoriaModel.findOne.mockReturnValue(execResult({
      _id: categoriaId,
      empresaId,
      tipo: CATEGORIA_FINANCEIRA_TIPO.SAIDA,
      ativo: true,
    }));
    fechamentoModel.findOne.mockReturnValue(execResult({
      _id: new Types.ObjectId(),
      empresaId,
      competencia: '2026-08',
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
    }));

    await expect(service.createMovimento({
      empresaId: empresaId.toString(),
      contaId: contaId.toString(),
      categoriaId: categoriaId.toString(),
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      descricao: 'Despesa',
      valor: '20.00',
      dataMovimento: '2026-08-10',
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.PIX,
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);
    expect(movimentoModel.create).not.toHaveBeenCalled();
  });

  it('bloqueia titulo em competencia fechada', async () => {
    const empresaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const { service, categoriaModel, tituloModel, fechamentoModel } = createService();

    fechamentoModel.findOne.mockReturnValue(execResult({
      _id: new Types.ObjectId(),
      empresaId,
      competencia: '2026-08',
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
    }));

    await expect(service.createTitulo({
      empresaId: empresaId.toString(),
      tipo: TITULO_FINANCEIRO_TIPO.PAGAR,
      categoriaId: categoriaId.toString(),
      descricao: 'Internet',
      valorTotal: '120.00',
      dataCompetencia: '2026-08-01',
      dataVencimento: '2026-08-10',
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);

    expect(categoriaModel.findOne).not.toHaveBeenCalled();
    expect(tituloModel.create).not.toHaveBeenCalled();
  });

  it('bloqueia fechamento mensal ja fechado', async () => {
    const empresaId = new Types.ObjectId();
    const usuarioId = new Types.ObjectId().toString();
    const { service, empresaModel, fechamentoModel } = createService();

    fechamentoModel.findOne.mockReturnValue(execResult({
      _id: new Types.ObjectId(),
      empresaId,
      competencia: '2026-08',
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
    }));

    await expect(service.fecharMesFinanceiro({
      competencia: '2026-08',
    }, usuarioId, empresaId.toString())).rejects.toThrow(BadRequestException);

    expect(empresaModel.findById).not.toHaveBeenCalled();
    expect(fechamentoModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reabre competencia mensal fechada com motivo e auditoria', async () => {
    const empresaId = new Types.ObjectId();
    const fechamentoId = new Types.ObjectId();
    const usuarioId = new Types.ObjectId().toString();
    const motivo = 'Ajuste de comprovante recebido apos fechamento';
    const fechamento = {
      _id: fechamentoId,
      empresaId,
      competencia: '2026-08',
      periodoInicio: new Date('2026-08-01T00:00:00.000Z'),
      periodoFim: new Date('2026-08-31T23:59:59.999Z'),
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
      snapshotHashSha256: 'hash',
    };
    const reaberto = {
      ...fechamento,
      status: FECHAMENTO_MENSAL_STATUS.REABERTO,
      motivoReabertura: motivo,
    };
    const { service, fechamentoModel, auditoriaService } = createService();

    fechamentoModel.findOne.mockReturnValue(execResult(fechamento));
    fechamentoModel.findOneAndUpdate.mockReturnValue(execResult(reaberto));

    const result = await service.reabrirMesFinanceiro({
      competencia: '2026-08',
      motivo,
    }, usuarioId, empresaId.toString());

    expect(fechamentoModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: empresaId.toString(),
        competencia: '2026-08',
      }),
      expect.objectContaining({
        status: FECHAMENTO_MENSAL_STATUS.REABERTO,
        motivoReabertura: motivo,
        reabertoEm: expect.any(Date),
      }),
      { new: true },
    );
    expect(fechamentoModel.findOneAndUpdate.mock.calls[0][1].reabertoPor.toString()).toBe(usuarioId);
    expect(auditoriaService.registrarEventoNegocio).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId,
      dados: expect.objectContaining({
        competencia: '2026-08',
        motivo,
      }),
    }));
    expect(result?.status).toBe(FECHAMENTO_MENSAL_STATUS.REABERTO);
  });

  it('registra entrada manual somando saldo da conta', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const { service, contaModel, categoriaModel, movimentoModel } = createService();

    contaModel.findOne.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('300.00'),
    }));
    categoriaModel.findOne.mockReturnValue(execResult({
      _id: categoriaId,
      empresaId,
      tipo: CATEGORIA_FINANCEIRA_TIPO.ENTRADA,
      ativo: true,
    }));
    movimentoModel.create.mockResolvedValue({
      _id: movimentoId,
      empresaId,
      contaId,
      categoriaId,
      tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
      descricao: 'Entrada em dinheiro',
      valor: Types.Decimal128.fromString('50.00'),
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.DINHEIRO,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    });
    contaModel.findOneAndUpdate.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('350.00'),
    }));

    const result = await service.createMovimento({
      empresaId: empresaId.toString(),
      contaId: contaId.toString(),
      categoriaId: categoriaId.toString(),
      tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
      descricao: 'Entrada em dinheiro',
      valor: '50.00',
      dataMovimento: '2026-08-05',
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.DINHEIRO,
    }, new Types.ObjectId().toString(), empresaId.toString());

    expect(contaModel.findOneAndUpdate.mock.calls[0][1].saldoAtual.toString()).toBe('350.00');
    expect(result.status).toBe(MOVIMENTO_CAIXA_STATUS.CONFIRMADO);
  });

  it('estorna movimento ligado a titulo revertendo saldo e baixa', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const categoriaId = new Types.ObjectId();
    const tituloId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const usuarioId = new Types.ObjectId().toString();
    const movimento = {
      _id: movimentoId,
      empresaId,
      contaId,
      categoriaId,
      tituloId,
      tipo: MOVIMENTO_CAIXA_TIPO.ENTRADA,
      descricao: 'Baixa - Venda',
      valor: Types.Decimal128.fromString('100.00'),
      dataMovimento: new Date('2026-08-05T12:00:00.000Z'),
      formaPagamento: FORMA_PAGAMENTO_FINANCEIRO.PIX,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    };
    const titulo = {
      _id: tituloId,
      empresaId,
      tipo: TITULO_FINANCEIRO_TIPO.RECEBER,
      categoriaId,
      descricao: 'Venda',
      valorTotal: Types.Decimal128.fromString('100.00'),
      valorPago: Types.Decimal128.fromString('100.00'),
      status: TITULO_FINANCEIRO_STATUS.QUITADO,
    };
    const { service, contaModel, tituloModel, movimentoModel } = createService();

    movimentoModel.findOne.mockReturnValue(execResult(movimento));
    contaModel.findOne.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('350.00'),
    }));
    contaModel.findOneAndUpdate.mockReturnValue(execResult({
      _id: contaId,
      empresaId,
      saldoAtual: Types.Decimal128.fromString('250.00'),
    }));
    movimentoModel.findOneAndUpdate.mockReturnValue(execResult({
      ...movimento,
      status: MOVIMENTO_CAIXA_STATUS.ESTORNADO,
      motivoEstorno: 'Pagamento cancelado',
    }));
    tituloModel.findOne.mockReturnValue(execResult(titulo));
    tituloModel.findOneAndUpdate.mockReturnValue(execResult({
      ...titulo,
      valorPago: Types.Decimal128.fromString('0.00'),
      status: TITULO_FINANCEIRO_STATUS.ABERTO,
      dataPagamento: undefined,
    }));

    const result = await service.estornarMovimento(movimentoId.toString(), {
      motivo: 'Pagamento cancelado',
    }, usuarioId, empresaId.toString());

    expect(contaModel.findOneAndUpdate.mock.calls[0][1].saldoAtual.toString()).toBe('250.00');
    expect(movimentoModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: movimentoId.toString(),
        empresaId: empresaId.toString(),
      }),
      expect.objectContaining({
        status: MOVIMENTO_CAIXA_STATUS.ESTORNADO,
        motivoEstorno: 'Pagamento cancelado',
      }),
      { new: true },
    );
    expect(tituloModel.findOneAndUpdate.mock.calls[0][1].$set.valorPago.toString()).toBe('0.00');
    expect(tituloModel.findOneAndUpdate.mock.calls[0][1].$set.status).toBe(TITULO_FINANCEIRO_STATUS.ABERTO);
    expect(tituloModel.findOneAndUpdate.mock.calls[0][1].$unset).toEqual({ dataPagamento: '' });
    expect(result.status).toBe(MOVIMENTO_CAIXA_STATUS.ESTORNADO);
  });

  it('bloqueia estorno de movimento ja estornado', async () => {
    const empresaId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const { service, contaModel, movimentoModel } = createService();

    movimentoModel.findOne.mockReturnValue(execResult({
      _id: movimentoId,
      empresaId,
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      valor: Types.Decimal128.fromString('10.00'),
      dataMovimento: new Date('2026-08-05T12:00:00.000Z'),
      status: MOVIMENTO_CAIXA_STATUS.ESTORNADO,
    }));

    await expect(service.estornarMovimento(movimentoId.toString(), {
      motivo: 'Duplicidade',
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);

    expect(contaModel.findOne).not.toHaveBeenCalled();
    expect(movimentoModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('bloqueia estorno em competencia fechada', async () => {
    const empresaId = new Types.ObjectId();
    const contaId = new Types.ObjectId();
    const movimentoId = new Types.ObjectId();
    const { service, contaModel, movimentoModel, fechamentoModel } = createService();

    movimentoModel.findOne.mockReturnValue(execResult({
      _id: movimentoId,
      empresaId,
      contaId,
      tipo: MOVIMENTO_CAIXA_TIPO.SAIDA,
      valor: Types.Decimal128.fromString('10.00'),
      dataMovimento: new Date('2026-08-05T12:00:00.000Z'),
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
    }));
    fechamentoModel.findOne.mockReturnValue(execResult({
      _id: new Types.ObjectId(),
      empresaId,
      competencia: '2026-08',
      status: FECHAMENTO_MENSAL_STATUS.FECHADO,
    }));

    await expect(service.estornarMovimento(movimentoId.toString(), {
      motivo: 'Competencia encerrada',
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);

    expect(contaModel.findOne).not.toHaveBeenCalled();
    expect(movimentoModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('monta relatorio por competencia com limites UTC e isolamento da empresa', async () => {
    const empresaId = new Types.ObjectId().toString();
    const { service, empresaModel, contaModel, categoriaModel, tituloModel, movimentoModel, recorrenciaModel, anexoModel } = createService();

    empresaModel.findById.mockReturnValue(chainResult({ _id: empresaId, nomeFantasia: 'Mantec' }));
    contaModel.find.mockReturnValue(chainResult([]));
    categoriaModel.find.mockReturnValue(chainResult([]));
    movimentoModel.find.mockReturnValue(chainResult([]));
    tituloModel.find.mockReturnValue(chainResult([]));
    recorrenciaModel.find.mockReturnValue(chainResult([]));
    anexoModel.find.mockReturnValue(chainResult([]));

    await service.getRelatorioMensalDados({ competencia: '2026-02' }, empresaId);

    const inicio = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
    const fim = new Date(Date.UTC(2026, 2, 0, 23, 59, 59, 999));
    expect(movimentoModel.find.mock.calls[0][0]).toEqual({
      empresaId,
      status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO,
      dataMovimento: { $gte: inicio, $lte: fim },
    });
    expect(tituloModel.find.mock.calls[0][0]).toEqual({
      empresaId,
      $or: [
        { dataCompetencia: { $gte: inicio, $lte: fim } },
        { dataVencimento: { $gte: inicio, $lte: fim } },
        { dataPagamento: { $gte: inicio, $lte: fim } },
      ],
    });
    expect(anexoModel.find.mock.calls[0][0]).toEqual({
      empresaId,
      ativo: true,
      dataReferencia: { $gte: inicio, $lte: fim },
    });
  });

  it('aplica isolamento por empresa nas consultas financeiras', async () => {
    const empresaId = new Types.ObjectId().toString();
    const { service, contaModel, categoriaModel, tituloModel, movimentoModel, recorrenciaModel } = createService();

    contaModel.find.mockReturnValue(execResult([]));
    categoriaModel.find.mockReturnValue(execResult([]));
    tituloModel.find.mockReturnValue(chainResult([]));
    movimentoModel.find.mockReturnValue(chainResult([]));
    recorrenciaModel.find.mockReturnValue(chainResult([]));

    await service.findAllContas(empresaId, { ativo: 'true' });
    await service.findAllCategorias(empresaId, { tipo: CATEGORIA_FINANCEIRA_TIPO.SAIDA });
    await service.findAllTitulos(empresaId, { status: TITULO_FINANCEIRO_STATUS.ABERTO });
    await service.findAllMovimentos(empresaId, { status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO });
    await service.findAllRecorrencias(empresaId, { status: 'ativa' });

    expect(contaModel.find).toHaveBeenCalledWith({ empresaId, ativo: true });
    expect(categoriaModel.find).toHaveBeenCalledWith({ empresaId, tipo: CATEGORIA_FINANCEIRA_TIPO.SAIDA });
    expect(tituloModel.find).toHaveBeenCalledWith({ empresaId, status: TITULO_FINANCEIRO_STATUS.ABERTO });
    expect(movimentoModel.find).toHaveBeenCalledWith({ empresaId, status: MOVIMENTO_CAIXA_STATUS.CONFIRMADO });
    expect(recorrenciaModel.find).toHaveBeenCalledWith({ empresaId, status: 'ativa' });
  });

  it('bloqueia criacao financeira para empresa diferente da autenticada', async () => {
    const empresaId = new Types.ObjectId();
    const outraEmpresaId = new Types.ObjectId();
    const { service, contaModel } = createService();

    await expect(service.createConta({
      empresaId: outraEmpresaId.toString(),
      nome: 'Conta de outra empresa',
      tipo: 'caixa',
    }, new Types.ObjectId().toString(), empresaId.toString())).rejects.toThrow(BadRequestException);

    expect(contaModel.exists).not.toHaveBeenCalled();
    expect(contaModel.create).not.toHaveBeenCalled();
  });
});
