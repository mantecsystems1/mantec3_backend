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
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
    };
    const categoriaModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
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
    const auditoriaService = {
      registrarEventoNegocio: jest.fn().mockResolvedValue(undefined),
    };

    const service = new FinanceiroAdmService(
      contaModel as never,
      categoriaModel as never,
      tituloModel as never,
      movimentoModel as never,
      recorrenciaModel as never,
      auditoriaService as never,
    );

    return {
      service,
      contaModel,
      categoriaModel,
      tituloModel,
      movimentoModel,
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
});
