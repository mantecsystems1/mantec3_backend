import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PagamentosService } from '../src/financeiro/pagamentos/pagamentos.service';
import { FinanceiroAdmService } from '../src/financeiro/financeiro-adm/financeiro-adm.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PagamentoSchema } from '../src/financeiro/pagamentos/schemas/pagamento.schema';
import { VendaSchema } from '../src/financeiro/vendas/schemas/venda.schema';
import { LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { EmpresaSchema } from '../src/core/empresa/schemas/empresa.schema';
import { ContaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/conta-financeira.schema';
import { CategoriaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/categoria-financeira.schema';
import { TituloFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/titulo-financeiro.schema';
import { MovimentoCaixaSchema } from '../src/financeiro/financeiro-adm/schemas/movimento-caixa.schema';
import { RecorrenciaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/recorrencia-financeira.schema';
import { AnexoFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/anexo-financeiro.schema';
import { FechamentoMensalFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/fechamento-mensal-financeiro.schema';


describe('Pagamentos atomicos em MongoDB isolado', { timeout: 600000 }, () => {
  let server: MongoMemoryReplSet;
  let db: Connection;
  let service: PagamentosService;
  let financeiro: FinanceiroAdmService;
  let vendaId: string;
  const empresaId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();
  const dto = (valor: string) => ({ vendaId, valor, formaPagamento: 'pix', dataPagamento: '2026-09-20' });
  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    const pagamentos = db.model('Pagamento', PagamentoSchema);
    const vendas = db.model('Venda', VendaSchema);
    const auditoria = new AuditoriaService(db.model('LogEvento', LogEventoSchema) as never);
    financeiro = new FinanceiroAdmService(
      db.model('ContaFinanceira', ContaFinanceiraSchema) as never,
      db.model('CategoriaFinanceira', CategoriaFinanceiraSchema) as never,
      db.model('TituloFinanceiro', TituloFinanceiroSchema) as never,
      db.model('MovimentoCaixa', MovimentoCaixaSchema) as never,
      db.model('RecorrenciaFinanceira', RecorrenciaFinanceiraSchema) as never,
      db.model('AnexoFinanceiro', AnexoFinanceiroSchema) as never,
      db.model('FechamentoMensalFinanceiro', FechamentoMensalFinanceiroSchema) as never,
      db.model('Empresa', EmpresaSchema) as never, auditoria,
    );
    service = new PagamentosService(pagamentos as never, vendas as never, auditoria, financeiro);
    await Promise.all(Object.values(db.models).map(model => model.init()));
  });
  beforeEach(async () => {

    for (const model of Object.values(db.models)) await model.deleteMany({});
    const venda = await db.model('Venda').create({ empresaId, clienteId: new Types.ObjectId(), origemTipo: 'direta', origemId: new Types.ObjectId(), subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    vendaId = String(venda._id);
  });
  after(async () => { await db?.close(); await server?.stop(); });
  it('duas cobrancas simultaneas nao ultrapassam o total', async () => {
    await service.create(dto('40'), actorId, empresaId);
    const results = await Promise.allSettled([service.create(dto('40'), actorId, empresaId), service.create(dto('40'), actorId, empresaId)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    const payments = await db.model('Pagamento').find();
    assert.equal(payments.reduce((sum, p) => sum + Number(p.valor), 0), 80);
    assert.equal(await db.model('MovimentoCaixa').countDocuments({ status: 'confirmado' }), 2);
  });
  it('falha apos lancamento financeiro desfaz pagamento, caixa, titulo e auditoria', async () => {
    const original = financeiro.registrarPagamentoVenda.bind(financeiro);
    financeiro.registrarPagamentoVenda = async (...args) => {
      await original(...args);
      throw new Error('Falha injetada depois do caixa');
    };
    try {
      await assert.rejects(service.create(dto('40'), actorId, empresaId), /Falha injetada/);
    } finally { financeiro.registrarPagamentoVenda = original; }
    for (const name of ['Pagamento', 'MovimentoCaixa', 'TituloFinanceiro', 'LogEvento', 'ContaFinanceira']) {
      assert.equal(await db.model(name).countDocuments(), 0);
    }
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pendente');
  });
  it('edicao e remocao mantem saldo consistente', async () => {
    const payment = await service.create(dto('40'), actorId, empresaId);
    await service.update(String(payment._id), { valor: '100' }, actorId, empresaId);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pago');
    await service.remove(String(payment._id), actorId, empresaId);
    assert.equal(await db.model('Pagamento').countDocuments(), 0);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pendente');
  });
});
