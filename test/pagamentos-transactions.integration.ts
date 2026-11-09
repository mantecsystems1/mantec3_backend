import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { OrcamentosService } from '../src/orcamentos/orcamentos.service';
import { OrcamentoSchema } from '../src/orcamentos/schemas/orcamento.schema';
import { ItensOrcamentoSchema } from '../src/orcamentos/schemas/itens-orcamento.schema';
import { RecebimentoEquipamentoSchema } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PagamentosService } from '../src/financeiro/pagamentos/pagamentos.service';
import { FinanceiroAdmService } from '../src/financeiro/financeiro-adm/financeiro-adm.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PagamentoSchema } from '../src/financeiro/pagamentos/schemas/pagamento.schema';
import { VendaSchema } from '../src/financeiro/vendas/schemas/venda.schema';
import { OperacaoVendaSchema } from '../src/financeiro/vendas/schemas/operacao-venda.schema';
import { LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { EmpresaSchema } from '../src/core/empresa/schemas/empresa.schema';
import { ContaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/conta-financeira.schema';
import { CategoriaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/categoria-financeira.schema';
import { TituloFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/titulo-financeiro.schema';
import { MovimentoCaixaSchema } from '../src/financeiro/financeiro-adm/schemas/movimento-caixa.schema';
import { RecorrenciaFinanceiraSchema } from '../src/financeiro/financeiro-adm/schemas/recorrencia-financeira.schema';
import { AnexoFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/anexo-financeiro.schema';
import { FechamentoMensalFinanceiroSchema } from '../src/financeiro/financeiro-adm/schemas/fechamento-mensal-financeiro.schema';
import { VendasService } from '../src/financeiro/vendas/vendas.service';
import { ItensVendaSchema } from '../src/financeiro/vendas/schemas/itens-venda.schema';
import { ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { ServicoSchema } from '../src/catalogo/servicos/schemas/servico.schema';
import { OsService } from '../src/ordens-servico/os.service';
import { OrdemServicoSchema } from '../src/ordens-servico/schemas/ordem-servico.schema';


describe('Pagamentos atomicos em MongoDB isolado', { timeout: 600000 }, () => {
  let server: MongoMemoryReplSet;
  let db: Connection;
  let service: PagamentosService;
  let financeiro: FinanceiroAdmService;
  let vendasService: VendasService;
  let osService: OsService;
  let orcamentos: OrcamentosService;
  let auditoria: AuditoriaService;
  let clienteId: string;
  let servicoId: string;
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
    auditoria = new AuditoriaService(db.model('LogEvento', LogEventoSchema) as never);
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
    vendasService = new VendasService(vendas as never, db.model('ItensVenda', ItensVendaSchema) as never, auditoria, financeiro, db.model('OperacaoVenda', OperacaoVendaSchema) as never);
    db.model('Cliente', ClienteSchema);
    db.model('Servico', ServicoSchema);
    osService = new OsService(db.model('OrdemServico', OrdemServicoSchema) as never, {} as never, {} as never, vendas as never, auditoria, {} as never);
    db.model('Usuario', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    db.model('RecebimentoEquipamento', RecebimentoEquipamentoSchema);
    orcamentos = new OrcamentosService(db.model('Orcamento', OrcamentoSchema) as never, db.model('ItensOrcamento', ItensOrcamentoSchema) as never, auditoria, osService);
    await Promise.all(Object.values(db.models).map(model => model.init()));
  });
  beforeEach(async () => {

    for (const model of Object.values(db.models)) await model.deleteMany({});
    clienteId = String((await db.model('Cliente').create({ empresaId, nome: 'Cliente financeiro teste', cpfCnpj: '00000000000' }))._id);
    servicoId = String((await db.model('Servico').create({ empresaId, nome: 'Serviço teste', ativo: true }))._id);
    const venda = await db.model('Venda').create({ empresaId, clienteId, origemTipo: 'venda_direta', origemId: new Types.ObjectId(), subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    vendaId = String(venda._id);
  });
  after(async () => { await db?.close(); await server?.stop(); });

  const user = () => ({ id: actorId, _id: actorId, sub: actorId, empresaId, nome: 'QA', email: 'qa@example.invalid' });
  const origem = async () => {
    await db.model('Usuario').updateOne({ _id: actorId }, { empresaId, nome: 'QA' }, { upsert: true });
    const recebimento = await db.model('RecebimentoEquipamento').create({ empresaId, clienteId, recebidoPor: actorId, tipoEquipamento: 'Celular', marca: 'QA', modelo: 'QA', dataRecebimento: new Date(), status: 'recebido' });
    const quote = await db.model('Orcamento').create({ empresaId, clienteId, criadoPor: actorId, recebimentoEquipamentoId: recebimento._id, status: 'aprovado', validade: new Date('2027-01-01'), subtotal: '100', total: '100' });
    return { empresaId, clienteId, tecnicoId: actorId, recebimentoEquipamentoId: String(recebimento._id), orcamentoId: String(quote._id), prioridade: 'normal', statusOperacional: 'aberta', dataEntrada: new Date().toISOString() };
  };
  const saleFor = (id: string, valor = '100') => ({ empresaId, clienteId, origemTipo: 'ordem_servico', origemId: id, subtotal: valor, total: valor, statusFinanceiro: 'pendente', itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: valor }] });
  const vendaCompleta = (operacaoId: string, origemTipo = 'venda_direta', origemId = clienteId, valor = '100') => ({
    operacaoId, clienteId, origemTipo, origemId, descontos: '0',
    itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: valor }],
  });
  const isConflict = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.() === 409;

  it('gera somente uma OS com chamadas concorrentes de geração e criação manual', async () => {
    const input = await origem();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2 ? osService.create(input, empresaId) : orcamentos.gerarOrdemServico(input.orcamentoId, user())));
    assert.equal(new Set(results.map(o => String(o._id))).size, 1);
    assert.equal(await db.model('OrdemServico').countDocuments({ orcamentoId: input.orcamentoId }), 1);
    assert.equal(await db.model('LogEvento').countDocuments({ entidadeId: results[0]._id, tipoEvento: 'OS_CRIADA' }), 1);
  });
  it('venda composta concorrente grava uma vez e recupera a mesma venda pela operação', async () => {
    const operation = '00000000-0000-4000-8000-000000000001';
    const input = vendaCompleta(operation);
    const results = await Promise.all(Array.from({ length: 8 }, () => vendasService.createCompleto(input, user())));
    assert.equal(new Set(results.map(v => String(v?._id))).size, 1);
    const id = String(results[0]?._id);
    assert.equal(await db.model('Venda').countDocuments(), 2); // inclui a venda base do beforeEach
    assert.equal(await db.model('ItensVenda').countDocuments({ vendaId: id }), 1);
    assert.equal(await db.model('OperacaoVenda').countDocuments({ operacaoId: operation }), 1);
    assert.equal(await db.model('TituloFinanceiro').countDocuments({ origemTipo: 'venda', origemId: new Types.ObjectId(id) }), 1);
    assert.equal(await db.model('LogEvento').countDocuments({ entidadeId: new Types.ObjectId(id), tipoEvento: 'VENDA_GERADA' }), 1);
    assert.equal(String((await vendasService.porOperacao(operation, user()))?._id), id);
    await assert.rejects(vendasService.createCompleto(vendaCompleta(operation, 'venda_direta', clienteId, '120'), user()), e => (e as { getStatus?: () => number }).getStatus?.() === 409);
    assert.equal(String((await vendasService.porOperacao(operation, { ...user(), id: new Types.ObjectId().toString() }))?._id), id);
    await assert.rejects(vendasService.porOperacao(operation, { ...user(), empresaId: new Types.ObjectId().toString() }), /Venda ainda não salva/);
    assert.equal(await db.model('Venda').countDocuments(), 2);
  });
  it('chave de operação também recupera venda de OS existente e falha posterior não deixa operação órfã', async () => {
    const order = await osService.create(await origem(), empresaId);
    const existing = await vendasService.create(saleFor(String(order._id)), actorId, empresaId);
    const operation = '00000000-0000-4000-8000-000000000002';
    const alias = await vendasService.createCompleto(vendaCompleta(operation, 'ordem_servico', String(order._id)), user());
    assert.equal(String(alias?._id), String(existing?._id));
    assert.equal(String((await vendasService.porOperacao(operation, user()))?._id), String(existing?._id));
    assert.equal(await db.model('Venda').countDocuments({ origemId: order._id, origemTipo: 'ordem_servico' }), 1);

    const failingOperation = '00000000-0000-4000-8000-000000000003';
    const originalFinance = financeiro.sincronizarTituloVenda;
    financeiro.sincronizarTituloVenda = async (...args) => { await originalFinance.apply(financeiro, args); throw new Error('Falha título venda QA'); };
    try { await assert.rejects(vendasService.createCompleto(vendaCompleta(failingOperation), user()), /Falha título venda QA/); }
    finally { financeiro.sincronizarTituloVenda = originalFinance; }
    assert.equal(await db.model('OperacaoVenda').countDocuments({ operacaoId: failingOperation }), 0);
    assert.equal(await db.model('Venda').countDocuments({ origemTipo: 'venda_direta' }), 1); // inclui a venda base
    const retry = await vendasService.createCompleto(vendaCompleta(failingOperation), user());
    assert.ok(retry?._id);
    assert.equal(await db.model('OperacaoVenda').countDocuments({ operacaoId: failingOperation }), 1);
  });
  it('duplicatas legadas de OS geram conflito sem escolher, apagar ou criar outra', async () => {
    const input = await origem(); await db.model('OrdemServico').insertMany([input, input]);
    await assert.rejects(orcamentos.gerarOrdemServico(input.orcamentoId, user()), isConflict);
    assert.equal(await db.model('OrdemServico').countDocuments({ orcamentoId: input.orcamentoId }), 2);
  });
  it('gera uma venda, seus itens e título uma vez sob concorrência; conteúdo diferente recebe conflito', async () => {
    const order = await osService.create(await origem(), empresaId); const input = saleFor(String(order._id));
    const results = await Promise.all(Array.from({ length: 8 }, () => vendasService.create(input, actorId, empresaId)));
    assert.equal(new Set(results.map(v => String(v!._id))).size, 1);
    const id = results[0]!._id;
    assert.equal(await db.model('ItensVenda').countDocuments({ vendaId: id }), 1);
    assert.equal(await db.model('TituloFinanceiro').countDocuments({ origemTipo: 'venda', origemId: id }), 1);
    assert.equal(await db.model('LogEvento').countDocuments({ entidadeId: id, tipoEvento: 'VENDA_GERADA' }), 1);
    await assert.rejects(vendasService.create(saleFor(String(order._id), '120'), actorId, empresaId), isConflict);
    assert.equal(await db.model('Venda').countDocuments({ origemId: order._id, origemTipo: 'ordem_servico' }), 1);
  });
  it('duplicatas legadas de venda bloqueiam geração; venda direta permanece independente', async () => {
    const order = await osService.create(await origem(), empresaId); const input = saleFor(String(order._id));
    await db.model('Venda').insertMany([input, input]);
    await assert.rejects(vendasService.create(input, actorId, empresaId), isConflict);
    assert.equal(await db.model('Venda').countDocuments({ origemId: order._id }), 2);
    const direct = { ...input, origemTipo: 'venda_direta', origemId: clienteId };
    const a = await vendasService.create(direct, actorId, empresaId), b = await vendasService.create(direct, actorId, empresaId);
    assert.notEqual(String(a!._id), String(b!._id));
  });
  it('falha posterior à auditoria da OS ou título da venda desfaz todos os efeitos e permite retry', async () => {
    const input = await origem(); const originalAudit = auditoria.registrarEventoNegocio;
    auditoria.registrarEventoNegocio = async (event) => { await originalAudit.call(auditoria, event); throw new Error('Falha QA'); };
    try { await assert.rejects(osService.create(input, empresaId), /Falha QA/); } finally { auditoria.registrarEventoNegocio = originalAudit; }
    assert.equal(await db.model('OrdemServico').countDocuments({ orcamentoId: input.orcamentoId }), 0);
    assert.equal(await db.model('LogEvento').countDocuments({ tipoEvento: 'OS_CRIADA' }), 0);
    const order = await osService.create(input, empresaId); const originalFinance = financeiro.sincronizarTituloVenda;
    financeiro.sincronizarTituloVenda = async (...args) => { await originalFinance.apply(financeiro, args); throw new Error('Falha titulo QA'); };
    try { await assert.rejects(vendasService.create(saleFor(String(order._id)), actorId, empresaId), /Falha titulo QA/); } finally { financeiro.sincronizarTituloVenda = originalFinance; }
    assert.equal(await db.model('Venda').countDocuments({ origemId: order._id }), 0);
    assert.equal(await db.model('TituloFinanceiro').countDocuments(), 0);
    assert.ok(await vendasService.create(saleFor(String(order._id)), actorId, empresaId));
  });
  it('não permite contornar unicidade associando duas OS ou vendas por edição concorrente', async () => {
    const input = await origem();
    const a = await osService.create({ ...input, orcamentoId: undefined }, empresaId), b = await osService.create({ ...input, orcamentoId: undefined }, empresaId);
    const orders = await Promise.allSettled([a, b].map(o => osService.update(String(o._id), { orcamentoId: input.orcamentoId }, empresaId)));
    assert.equal(orders.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(orders.some(r => r.status === 'rejected' && isConflict(r.reason)));
    const saleInput = { ...saleFor(String(a._id)), origemTipo: 'venda_direta', origemId: clienteId };
    const c = await vendasService.create(saleInput, actorId, empresaId), d = await vendasService.create(saleInput, actorId, empresaId);
    const sales = await Promise.allSettled([c, d].map(v => vendasService.update(String(v!._id), { origemTipo: 'ordem_servico', origemId: String(a._id) }, actorId, empresaId)));
    assert.equal(sales.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(sales.some(r => r.status === 'rejected' && isConflict(r.reason)));
  });
  it('rejeita cliente divergente e origem externa na geração sem escrever registros', async () => {
    const input = await origem(); const order = await osService.create(input, empresaId);
    const other = await db.model('Cliente').create({ empresaId, nome: 'Outro', cpfCnpj: '111' });
    await assert.rejects(osService.create({ ...input, clienteId: String(other._id) }, empresaId), /corresponder/);
    await assert.rejects(vendasService.create({ ...saleFor(String(order._id)), clienteId: String(other._id) }, actorId, empresaId), /corresponder/);
    await assert.rejects(vendasService.create({ ...saleFor(String(order._id)), empresaId: String(new Types.ObjectId()) }, actorId, empresaId));
  });
  it('retry preserva OS cancelada e pagamentos já registrados na venda existente', async () => {
    const input = await origem(); const order = await osService.create(input, empresaId);
    await osService.remove(String(order._id), empresaId);
    const repeated = await osService.create(input, empresaId);
    assert.equal(String(repeated._id), String(order._id)); assert.equal(repeated.statusOperacional, 'cancelada');
    const saleInput = { ...saleFor(String(order._id)) };
    const sale = await vendasService.create(saleInput, actorId, empresaId);
    await service.create({ ...dto('40'), vendaId: String(sale!._id) }, actorId, empresaId);
    const recovered = await vendasService.create(saleInput, actorId, empresaId);
    assert.equal(String(recovered!._id), String(sale!._id)); assert.equal(recovered!.statusFinanceiro, 'parcial');
    assert.equal(await db.model('Pagamento').countDocuments({ vendaId: sale!._id }), 1);
    await db.model('Venda').updateOne({ _id: sale!._id }, { statusFinanceiro: 'cancelado' });
    await assert.rejects(vendasService.create(saleInput, actorId, empresaId), isConflict);
  });
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

  it('pagamento e venda reutilizam transação externa sem confirmar antes do fluxo completo', async () => {
    await assert.rejects(db.transaction(async () => {
      await vendasService.update(vendaId, { descontos: '10' }, actorId, empresaId);
      await service.create(dto('40'), actorId, empresaId);
      throw new Error('Falha no fluxo externo');
    }), /Falha no fluxo externo/);
    assert.equal(await db.model('Pagamento').countDocuments(), 0);
    assert.equal(await db.model('MovimentoCaixa').countDocuments(), 0);
    assert.equal(await db.model('TituloFinanceiro').countDocuments(), 0);
    assert.equal(Number((await db.model('Venda').findById(vendaId)).total), 100);
  });
  it('edicao e remocao mantem saldo consistente', async () => {
    const payment = await service.create(dto('40'), actorId, empresaId);
    await service.update(String(payment._id), { valor: '100' }, actorId, empresaId);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pago');
    await service.remove(String(payment._id), actorId, empresaId);
    assert.equal(await db.model('Pagamento').countDocuments(), 0);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pendente');
  });

  it('pagamentos parciais com meios distintos quitam somente a soma efetiva, com centavos', async () => {
    await service.create(dto('19.90'), actorId, empresaId);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).statusFinanceiro, 'parcial');
    await service.create({ ...dto('80.10'), formaPagamento: 'dinheiro' }, actorId, empresaId);
    const venda = await vendasService.findOne(vendaId, empresaId);
    assert.equal(venda.statusFinanceiro, 'pago');
    assert.equal(venda.totalPago, 100);
    assert.equal(venda.saldoRestante, 0);
    assert.equal(await db.model('MovimentoCaixa').countDocuments({ status: 'confirmado' }), 2);
    assert.equal((await db.model('ContaFinanceira').find()).reduce((total, conta) => total + Number(conta.saldoAtual), 0), 100);
  });

  it('pagamento e redução de total simultâneos não geram recebido acima do total', async () => {
    const results = await Promise.allSettled([
      service.create(dto('80'), actorId, empresaId),
      vendasService.update(vendaId, { descontos: '30' }, actorId, empresaId),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const venda = await vendasService.findOne(vendaId, empresaId);
    assert.ok(venda.totalPago <= Number(venda.total));
    assert.equal(Number((await db.model('TituloFinanceiro').findOne({ origemId: vendaId })).valorTotal), Number(venda.total));
  });

  it('edições sucessivas mantêm histórico de estornos sem colisão de idempotência', async () => {
    const payment = await service.create(dto('40'), actorId, empresaId);
    await service.update(String(payment._id), { valor: '70' }, actorId, empresaId);
    await service.update(String(payment._id), { valor: '100' }, actorId, empresaId);
    assert.equal(await db.model('MovimentoCaixa').countDocuments({ status: 'estornado' }), 2);
    assert.equal(await db.model('MovimentoCaixa').countDocuments({ status: 'confirmado' }), 1);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).totalPago, 100);
    assert.equal(Number((await db.model('ContaFinanceira').findOne()).saldoAtual), 100);
  });

  it('falha ao reeditar pagamento conserva caixa, título e valor anteriores', async () => {
    const payment = await service.create(dto('40'), actorId, empresaId);
    const original = financeiro.registrarPagamentoVenda.bind(financeiro);
    financeiro.registrarPagamentoVenda = async (...args) => { await original(...args); throw new Error('Falha na reedicao'); };
    try {
      await assert.rejects(service.update(String(payment._id), { valor: '100' }, actorId, empresaId), /Falha na reedicao/);
    } finally { financeiro.registrarPagamentoVenda = original; }
    assert.equal(Number((await db.model('Pagamento').findById(payment._id)).valor), 40);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).totalPago, 40);
    assert.equal(Number((await db.model('ContaFinanceira').findOne()).saldoAtual), 40);
    assert.equal(Number((await db.model('TituloFinanceiro').findOne({ origemId: vendaId })).valorPago), 40);
    assert.equal(await db.model('MovimentoCaixa').countDocuments({ status: 'estornado' }), 0);
  });

  it('bloqueia quitação manual por POST e PATCH sem modificar dados ou título', async () => {
    const createDto = { empresaId, clienteId, origemTipo: 'venda_direta', origemId: clienteId, subtotal: '100', total: '100', statusFinanceiro: 'pago' };
    await assert.rejects(vendasService.create(createDto, actorId, empresaId), /calculada pelos pagamentos/);
    await assert.rejects(vendasService.create({ ...createDto, statusFinanceiro: 'parcial' }, actorId, empresaId), /calculada pelos pagamentos/);
    await assert.rejects(vendasService.update(vendaId, { statusFinanceiro: 'pago' }, actorId, empresaId), /calculada pelos pagamentos/);
    assert.equal(await db.model('Venda').countDocuments(), 1);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pendente');
    assert.equal(await db.model('TituloFinanceiro').countDocuments(), 0);
  });

  it('ignora cache de venda legada marcada paga sem comprovante e aceita pagamento real', async () => {
    await db.model('Venda').findByIdAndUpdate(vendaId, { statusFinanceiro: 'pago' });
    assert.equal((await vendasService.findOne(vendaId, empresaId)).statusFinanceiro, 'pendente');
    await service.create(dto('100'), actorId, empresaId);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).statusFinanceiro, 'pago');
  });

  it('estorno no caixa deixa saldo da venda pendente e permite novo recebimento sem contar estorno', async () => {
    const payment = await service.create(dto('100'), actorId, empresaId);
    await financeiro.estornarMovimento(String(payment.movimentoCaixaId), { motivo: 'Teste de estorno' }, actorId, empresaId);
    const venda = await vendasService.findOne(vendaId, empresaId);
    assert.equal(venda.statusFinanceiro, 'pendente');
    assert.equal(venda.totalPago, 0);
    assert.equal(venda.saldoRestante, 100);
    assert.equal((await db.model('Venda').findById(vendaId)).statusFinanceiro, 'pendente');
    await service.create({ ...dto('100'), formaPagamento: 'dinheiro' }, actorId, empresaId);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).totalPago, 100);
  });

  it('desfaz substituição de itens e desconto abaixo do recebido, sem total parcial persistido', async () => {
    const sale = await vendasService.create({
      empresaId, clienteId, origemTipo: 'venda_direta', origemId: clienteId,
      subtotal: '100', total: '100', statusFinanceiro: 'pendente',
      itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: '100' }],
    }, actorId, empresaId);
    vendaId = String(sale._id);
    await service.create(dto('80'), actorId, empresaId);
    await assert.rejects(vendasService.update(vendaId, { descontos: '30' }, actorId, empresaId), /menor que o valor ja recebido/);
    await assert.rejects(vendasService.update(vendaId, {
      itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: '70' }],
    }, actorId, empresaId), /menor que o valor ja recebido/);
    const item = await db.model('ItensVenda').findOne({ vendaId });
    await assert.rejects(vendasService.updateItem(String(item._id), { valorUnitario: '70' }, empresaId), /menor que o valor ja recebido/);
    await assert.rejects(vendasService.removeItem(String(item._id), empresaId), /menor que o valor ja recebido|Desconto/);
    assert.equal(Number((await db.model('Venda').findById(vendaId)).total), 100);
    assert.equal(Number((await db.model('ItensVenda').findById(item._id)).valorUnitario), 100);
    assert.equal(Number((await db.model('TituloFinanceiro').findOne({ origemId: vendaId })).valorTotal), 100);
  });

  it('aumento do total recalcula pago para parcial e impede PATCH pendente sem estorno', async () => {
    await service.create(dto('100'), actorId, empresaId);
    await vendasService.update(vendaId, {
      itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: '120' }],
    }, actorId, empresaId);
    assert.equal((await vendasService.findOne(vendaId, empresaId)).statusFinanceiro, 'parcial');
    await assert.rejects(vendasService.update(vendaId, { statusFinanceiro: 'pendente' }, actorId, empresaId), /calculada pelos pagamentos/);
    await assert.rejects(vendasService.remove(vendaId, actorId, empresaId), /estornada antes de cancelar/);
  });

  it('falha financeira ao editar venda desfaz itens, título, total e auditoria', async () => {
    const original = financeiro.sincronizarTituloVenda.bind(financeiro);
    financeiro.sincronizarTituloVenda = async (...args) => { await original(...args); throw new Error('Falha injetada na venda'); };
    try {
      await assert.rejects(vendasService.update(vendaId, {
        itens: [{ tipo: 'servico', referenciaId: servicoId, quantidade: 1, valorUnitario: '120' }],
      }, actorId, empresaId), /Falha injetada na venda/);
    } finally { financeiro.sincronizarTituloVenda = original; }
    assert.equal(Number((await db.model('Venda').findById(vendaId)).total), 100);
    assert.equal(await db.model('ItensVenda').countDocuments({ vendaId }), 0);
    assert.equal(await db.model('TituloFinanceiro').countDocuments(), 0);
    assert.equal(await db.model('LogEvento').countDocuments(), 0);
  });

  it('empresa externa não altera, remove, consulta ou usa pagamento de outra empresa', async () => {
    const other = new Types.ObjectId().toString();
    const payment = await service.create(dto('40'), actorId, empresaId);
    await assert.rejects(service.create(dto('40'), actorId, other), /Venda nao encontrada/);
    await assert.rejects(service.update(String(payment._id), { valor: '100' }, actorId, other), /Venda nao encontrada/);
    await assert.rejects(service.remove(String(payment._id), actorId, other), /Venda nao encontrada/);
    await assert.rejects(vendasService.update(vendaId, { descontos: '10' }, actorId, other), /Venda nao encontrada/);
    assert.equal(await vendasService.findOne(vendaId, other), null);
    assert.equal(Number((await db.model('Pagamento').findById(payment._id)).valor), 40);
  });

  it('ausência de empresa autenticada não abre consulta global nem grava registros', async () => {
    await assert.rejects(vendasService.findAll(), /Empresa do usuario nao informada/);
    await assert.rejects(vendasService.findOne(vendaId), /Empresa do usuario nao informada/);
    await assert.rejects(vendasService.findAllItems(), /Empresa do usuario nao informada/);
    await assert.rejects(vendasService.create({ empresaId, clienteId, origemTipo: 'venda_direta',
      origemId: clienteId, subtotal: '100', total: '100', statusFinanceiro: 'pendente' }, actorId), /Empresa do usuario nao informada/);
    await assert.rejects(service.create(dto('40'), actorId), /Empresa do usuario nao informada/);
    assert.equal(await db.model('Venda').countDocuments(), 1);
    assert.equal(await db.model('Pagamento').countDocuments(), 0);
  });

  it('entrega bloqueia status pago forjado e pagamento estornado, mas aceita quitação real', async () => {
    const ordem = await db.model('OrdemServico').create({ empresaId, clienteId, tecnicoId: actorId,
      recebimentoEquipamentoId: new Types.ObjectId(), statusOperacional: 'concluida', prioridade: 'normal', dataEntrada: new Date() });
    await db.model('Venda').findByIdAndUpdate(vendaId, { origemTipo: 'ordem_servico', origemId: ordem._id, statusFinanceiro: 'pago' });
    const user = { empresaId, id: actorId, _id: actorId, sub: actorId, nome: 'Teste', email: 'teste@example.invalid' };
    const entrega = { entregueParaNome: 'Cliente de teste', assinaturaImagemBase64: 'assinatura-sintetica' };
    await assert.rejects(osService.registrarEntrega(String(ordem._id), entrega, user), /pagamento total/);
    const payment = await service.create(dto('100'), actorId, empresaId);
    await financeiro.estornarMovimento(String(payment.movimentoCaixaId), { motivo: 'Teste' }, actorId, empresaId);
    await assert.rejects(osService.registrarEntrega(String(ordem._id), entrega, user), /pagamento total/);
    await service.create(dto('100'), actorId, empresaId);
    const result = await osService.registrarEntrega(String(ordem._id), entrega, user);
    assert.ok(result?.dataEntrega);
  });
});
