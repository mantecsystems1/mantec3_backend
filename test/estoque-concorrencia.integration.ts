import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { EstoqueService } from '../src/estoque/estoque.service';
import { MovimentosEstoqueSchema } from '../src/estoque/schemas/movimento-estoque.schema';
import { SaldoEstoqueSchema } from '../src/estoque/schemas/saldo-estoque.schema';
import { ProdutoSchema } from '../src/catalogo/produtos/schemas/produto.schema';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { ComprasService } from '../src/compras/compras.service';
import { PedidosCompraSchema } from '../src/compras/schemas/pedido-compra.schema';
import { ItensPedidoCompraSchema } from '../src/compras/schemas/itens-pedido-compra.schema';

describe('Ledger e cache transacionais em MongoDB descartavel', { timeout: 120000 }, () => {
  let server: MongoMemoryReplSet, db: Connection, estoque: EstoqueService, audit: AuditoriaService, compras: ComprasService;
  const empresaId = new Types.ObjectId().toString(), outraEmpresaId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();
  let produtoId: string, outroProdutoId: string, produtoExternoId: string, fornecedorId: string;
  const dto = (tipo: string, quantidade: number, produto = produtoId) => ({ empresaId, produtoId: produto, tipo, quantidade, origemTipo: 'ajuste_manual', origemId: new Types.ObjectId().toString() });
  const criar = (tipo: string, quantidade: number, produto = produtoId) => estoque.create(dto(tipo, quantidade, produto), actorId, empresaId);
  const conferir = async (produto = produtoId) => {
    const ledger = await estoque.getDisponibilidadeProduto(produto, empresaId);
    const cache = await db.model('SaldoEstoque').findOne({ empresaId, produtoId: produto }).lean();
    assert.ok(cache);
    for (const campo of ['saldoFisico', 'reservado', 'disponivel'] as const) {
      assert.equal(cache[campo], ledger[campo], `${campo} difere do ledger`);
      assert.ok(ledger[campo] >= 0);
    }
    return ledger;
  };
  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    const movimentos = db.model('MovimentosEstoque', MovimentosEstoqueSchema), saldos = db.model('SaldoEstoque', SaldoEstoqueSchema), produtos = db.model('Produto', ProdutoSchema);
    audit = new AuditoriaService(db.model('LogEvento', LogEventoSchema) as never);
    estoque = new EstoqueService(movimentos as never, saldos as never, produtos as never, audit);
    const pedidos = db.model('PedidosCompra', PedidosCompraSchema), itens = db.model('ItensPedidoCompra', ItensPedidoCompraSchema);
    const fornecedores = db.model('Fornecedor', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    db.model('Empresa', new Schema({ nomeFantasia: String }));
    compras = new ComprasService(fornecedores as never, pedidos as never, itens as never, estoque, audit, {
      sincronizarTituloCompraPedido: async () => undefined,
      cancelarTituloPorOrigem: async () => undefined,
      cancelarTitulosPorOrigem: async () => undefined,
    } as never);
    await Promise.all(Object.values(db.models).map(model => model.init()));
  });
  beforeEach(async () => {
    for (const model of Object.values(db.models)) await model.deleteMany({});
    produtoId = String((await db.model('Produto').create({ empresaId, nome: 'Peca A' }))._id);
    outroProdutoId = String((await db.model('Produto').create({ empresaId, nome: 'Peca A2' }))._id);
    produtoExternoId = String((await db.model('Produto').create({ empresaId: outraEmpresaId, nome: 'Peca B' }))._id);
    fornecedorId = String((await db.model('Fornecedor').create({ empresaId, nome: 'Fornecedor A' }))._id);
  });
  after(async () => { await db?.close(); await server?.stop(); });

  it('aceita somente uma das oito saidas concorrentes para uma unidade', async () => {
    await criar('entrada_compra', 1);
    const result = await Promise.allSettled(Array.from({ length: 8 }, () => criar('saida', 1)));
    assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await conferir()).disponivel, 0);
    assert.equal(await db.model('MovimentosEstoque').countDocuments({ tipo: 'saida' }), 1);
  });
  it('estorno substitui DELETE sem apagar historico nem permitir saldo negativo', async () => {
    const entrada = await criar('entrada_compra', 2);
    await estoque.remove(String(entrada._id), actorId, empresaId);
    assert.equal((await conferir()).disponivel, 0);
    await assert.rejects(criar('saida', 1), /insuficiente/);
    await estoque.remove(String(entrada._id), actorId, empresaId);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2);
    assert.equal((await db.model('MovimentosEstoque').findById(entrada._id)).quantidade, 2);
    assert.ok((await estoque.findOne(String(entrada._id), empresaId))?.estornadoEm);
  });
  it('nao estorna entrada ja consumida e preserva auditoria e saldos', async () => {
    const entrada = await criar('entrada', 2);
    await criar('saida', 1);
    const logs = await db.model('LogEvento').countDocuments();
    await assert.rejects(estoque.remove(String(entrada._id), actorId, empresaId), /insuficiente/);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2);
    assert.equal(await db.model('LogEvento').countDocuments(), logs);
    assert.equal((await db.model('MovimentosEstoque').findById(entrada._id)).estornadoEm, undefined);
    assert.equal((await conferir()).disponivel, 1);
  });
  it('PATCH quantidade gera inverso e novo evento e retry nao duplica; ID antigo resolve cadeia', async () => {
    const entrada = await criar('entrada', 5);
    const novo = await estoque.update(String(entrada._id), { quantidade: 3 }, actorId, empresaId);
    assert.ok(novo); assert.notEqual(String(novo._id), String(entrada._id));
    assert.equal(String(novo.substituiId), String(entrada._id));
    assert.equal((await conferir()).disponivel, 3);
    assert.equal((await db.model('MovimentosEstoque').findById(entrada._id)).quantidade, 5);
    assert.equal(String((await estoque.update(String(entrada._id), { quantidade: 3 }, actorId, empresaId))?._id), String(novo._id));
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 3);
    const ultimo = await estoque.update(String(novo._id), { quantidade: 2 }, actorId, empresaId);
    assert.equal(String((await estoque.findOne(String(entrada._id), empresaId))?._id), String(ultimo?._id));
    assert.equal((await conferir()).disponivel, 2);
    await assert.rejects(estoque.update(String(entrada._id), { quantidade: 1 }, actorId, empresaId), /substituido/);
  });
  it('PATCH produto transfere efeito nos dois saldos e bloqueia origem ja consumida', async () => {
    const entrada = await criar('entrada', 5);
    await estoque.update(String(entrada._id), { produtoId: outroProdutoId, quantidade: 2 }, actorId, empresaId);
    assert.equal((await conferir()).disponivel, 0); assert.equal((await conferir(outroProdutoId)).disponivel, 2);
    const outraEntrada = await criar('entrada', 2); await criar('saida', 1);
    await assert.rejects(estoque.update(String(outraEntrada._id), { produtoId: outroProdutoId }, actorId, empresaId), /insuficiente/);
    assert.equal((await conferir()).disponivel, 1); assert.equal((await conferir(outroProdutoId)).disponivel, 2);
  });
  it('PATCH saida insuficiente e produto externo falham sem efeito parcial e tenant nao acessa registro', async () => {
    await criar('entrada', 2); const saida = await criar('saida', 1);
    await assert.rejects(estoque.update(String(saida._id), { quantidade: 3 }, actorId, empresaId), /insuficiente/);
    await assert.rejects(estoque.update(String(saida._id), { produtoId: produtoExternoId }, actorId, empresaId), /Produto nao encontrado/);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2); assert.equal((await conferir()).disponivel, 1);
    assert.equal(await estoque.remove(String(saida._id), actorId, outraEmpresaId), null);
    assert.equal(await estoque.findOne(String(saida._id), outraEmpresaId), null);
    assert.deepEqual(await estoque.findAll(outraEmpresaId), []);
  });
  it('duas edicoes conflitantes nao sobrescrevem mesmo evento', async () => {
    const entrada = await criar('entrada', 5);
    const result = await Promise.allSettled([estoque.update(String(entrada._id), { quantidade: 3 }, actorId, empresaId), estoque.update(String(entrada._id), { quantidade: 4 }, actorId, empresaId)]);
    assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal(await db.model('MovimentosEstoque').countDocuments(), 3);
    assert.ok([3, 4].includes((await conferir()).disponivel));
  });
  it('duas exclusoes do mesmo movimento estornam apenas uma vez', async () => {
    const entrada = await criar('entrada', 2);
    await Promise.all([estoque.remove(String(entrada._id), actorId, empresaId), estoque.remove(String(entrada._id), actorId, empresaId)]);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2); assert.equal((await conferir()).disponivel, 0);
  });
  it('falha auditoria apos ledger/cache faz rollback integral', async () => {
    const faulty = new EstoqueService(db.model('MovimentosEstoque') as never, db.model('SaldoEstoque') as never, db.model('Produto') as never, { registrarEventoNegocio: async () => { throw new Error('falha QA auditoria'); } } as never);
    await assert.rejects(faulty.create(dto('entrada', 2), actorId, empresaId), /falha QA/);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 0); assert.equal(await db.model('SaldoEstoque').countDocuments(), 0);
    assert.equal((await db.model('Produto').findById(produtoId)).__v, 0);
  });
  it('transacao externa aborta estoque e auditoria sem commit independente', async () => {
    await assert.rejects(db.transaction(async () => { await criar('entrada', 2); throw new Error('abortar transacao externa'); }), /abortar/);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 0); assert.equal(await db.model('SaldoEstoque').countDocuments(), 0); assert.equal(await db.model('LogEvento').countDocuments(), 0);
  });
  it('diagnostico nao escreve e cache legado divergente nao autoriza saida', async () => {
    await db.model('SaldoEstoque').create({ empresaId, produtoId, saldoFisico: 10, reservado: 0, disponivel: 10 });
    assert.equal((await estoque.diagnosticarSaldos(empresaId))[0].divergente, true);
    assert.equal((await db.model('SaldoEstoque').findOne({ produtoId })).disponivel, 10);
    await assert.rejects(criar('saida', 1), /insuficiente/); await criar('entrada', 1); assert.equal((await conferir()).disponivel, 1);
  });
  it('reserva/liberacao preservam saldo fisico e rejeitam reserva acima do disponivel', async () => {
    await criar('entrada', 2); const reserva = await criar('reserva_os', 1);
    assert.equal((await conferir()).saldoFisico, 2); assert.equal((await conferir()).reservado, 1);
    await assert.rejects(criar('reserva_os', 2), /insuficiente/);
    await estoque.remove(String(reserva._id), actorId, empresaId);
    assert.equal((await conferir()).disponivel, 2); assert.equal((await conferir()).reservado, 0); assert.equal((await estoque.getSaldoProduto(produtoId, empresaId)).saldo, 2);
  });
  it('compra recebida, edicao item e cancelamento sincronizam historico/cache', async () => {
    const pedido = await compras.createPedidoCompra({ empresaId, fornecedorId, status: 'recebido', itens: [{ produtoId, quantidade: 3, valorUnitario: '10' }] }, actorId, empresaId);
    assert.ok(pedido); assert.equal((await conferir()).disponivel, 3);
    const item = await db.model('ItensPedidoCompra').findOne({ pedidoCompraId: pedido._id }); assert.ok(item);
    await compras.updateItensPedidoCompra(String(item._id), { quantidade: 2 }, actorId, empresaId); assert.equal((await conferir()).disponivel, 2);
    await compras.removePedidoCompra(String(pedido._id), actorId, empresaId); assert.equal((await conferir()).disponivel, 0);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 4);
  });
  it('cancelamento compra consumida faz rollback de pedido e estoque', async () => {
    const pedido = await compras.createPedidoCompra({ empresaId, fornecedorId, status: 'recebido', itens: [{ produtoId, quantidade: 2, valorUnitario: '10' }] }, actorId, empresaId);
    assert.ok(pedido); await criar('saida', 1);
    await assert.rejects(compras.updatePedidoCompra(String(pedido._id), { status: 'cancelado' }, actorId, empresaId), /insuficiente/);
    assert.equal((await db.model('PedidosCompra').findById(pedido._id)).status, 'recebido'); assert.equal((await conferir()).disponivel, 1);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2);
  });
  it('sessao explicita participa do rollback incluindo auditoria', async () => {
    const session = await db.startSession();
    try {
      await assert.rejects(session.withTransaction(async () => {
        await estoque.create(dto('entrada', 2), actorId, empresaId, session);
        throw new Error('rollback sessao explicita');
      }), /rollback sessao/);
    } finally { await session.endSession(); }
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 0);
    assert.equal(await db.model('SaldoEstoque').countDocuments(), 0);
    assert.equal(await db.model('LogEvento').countDocuments(), 0);
  });
  it('sincronizacao concorrente da mesma compra nao duplica entrada', async () => {
    const origemId = new Types.ObjectId().toString();
    await Promise.all(Array.from({ length: 4 }, () => estoque.sincronizarEntradasOrigem(empresaId, 'pedido_compra', origemId, [{ produtoId, quantidade: 2 }])));
    assert.equal((await conferir()).disponivel, 2);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 1);
  });
  it('cancelar origem e consumir ultima unidade simultaneamente nao deixam saldo negativo', async () => {
    const origemId = new Types.ObjectId().toString();
    await estoque.sincronizarEntradasOrigem(empresaId, 'pedido_compra', origemId, [{ produtoId, quantidade: 1 }]);
    const result = await Promise.allSettled([estoque.sincronizarEntradasOrigem(empresaId, 'pedido_compra', origemId, []), criar('saida', 1)]);
    assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await conferir()).disponivel, 0);
  });
  it('evento compensatorio nao pode ser alterado nem estornado de novo', async () => {
    const entrada = await criar('entrada', 2);
    const removido = await estoque.remove(String(entrada._id), actorId, empresaId);
    assert.ok(removido?.estornoId);
    await assert.rejects(estoque.update(String(removido.estornoId), { quantidade: 1 }, actorId, empresaId), /compensatorio/);
    await assert.rejects(estoque.remove(String(removido.estornoId), actorId, empresaId), /compensatorio/);
    assert.equal(await db.model('MovimentosEstoque').countDocuments(), 2);
    assert.equal((await conferir()).disponivel, 0);
  });
});
