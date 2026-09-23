import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { VendasService } from '../src/financeiro/vendas/vendas.service';
import { RecebimentoEquipamentoService } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.service';
import { VendaSchema } from '../src/financeiro/vendas/schemas/venda.schema';
import { ItensVendaSchema } from '../src/financeiro/vendas/schemas/itens-venda.schema';
import { ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { RecebimentoEquipamentoSchema } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';

describe('Referencias de cliente isoladas por empresa em Mongo descartavel', { timeout: 120000 }, () => {
  let server: MongoMemoryServer, db: Connection, vendas: VendasService, recebimentos: RecebimentoEquipamentoService;
  const a = new Types.ObjectId().toString(), b = new Types.ObjectId().toString();
  let clienteA: string, clienteB: string, produtoA: string, produtoB: string, servicoB: string;
  const actorId = new Types.ObjectId().toString();
  const user = { empresaId: a, id: actorId, _id: actorId, sub: actorId, nome: 'QA', email: 'qa@example.invalid' };
  const sale = (clienteId: string) => ({ empresaId: a, clienteId, origemTipo: 'venda_direta', origemId: clienteId, subtotal: '10', total: '10', statusFinanceiro: 'pendente' });
  const receipt = (clienteId: string) => ({ empresaId: a, clienteId, recebidoPor: user.id, tipoEquipamento: 'teste', marca: 'teste', modelo: 'teste', dataRecebimento: new Date(), status: 'recebido' });
  before(async () => {
    server = await MongoMemoryServer.create(); db = await mongoose.createConnection(server.getUri()).asPromise();
    const clientes = db.model('Cliente', ClienteSchema);
    clienteA = String((await clientes.create({ empresaId: a, nome: 'A', cpfCnpj: '111' }))._id);
    clienteB = String((await clientes.create({ empresaId: b, nome: 'SEGREDO B', cpfCnpj: '222' }))._id);
    const produtos = db.model('Produto', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    const servicos = db.model('Servico', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    produtoA = String((await produtos.create({ empresaId: a, nome: 'Produto A' }))._id);
    produtoB = String((await produtos.create({ empresaId: b, nome: 'Produto B' }))._id);
    servicoB = String((await servicos.create({ empresaId: b, nome: 'Servico B' }))._id);
    db.model('Empresa', new Schema({ nomeFantasia: String })); db.model('Usuario', new Schema({ nome: String }));
    const child = db.model('Child', new Schema({ recebimentoEquipamentoId: Schema.Types.ObjectId }));
    const audit = { registrarEventoNegocio: async () => undefined } as never;
    const finance = { sincronizarTituloVenda: async () => undefined } as never;
    vendas = new VendasService(db.model('Venda', VendaSchema) as never, db.model('ItensVenda', ItensVendaSchema) as never, audit, finance);
    recebimentos = new RecebimentoEquipamentoService(db.model('RecebimentoEquipamento', RecebimentoEquipamentoSchema) as never, child as never, child as never, child as never, child as never, audit);
  });
  after(async () => { await db?.close(); await server?.stop(); });
  it('rejeita criacao cruzada antes de gravar venda ou recebimento', async () => {
    await assert.rejects(vendas.create(sale(clienteB), user.id, a), /Referencia nao encontrada/);
    await assert.rejects(recebimentos.create(receipt(clienteB), user), /Referencia nao encontrada/);
    assert.equal(await db.model('Venda').countDocuments(), 0);
    assert.equal(await db.model('RecebimentoEquipamento').countDocuments(), 0);
  });
  it('permite cliente proprio e rejeita troca por cliente externo sem alterar registro', async () => {
    const v = await vendas.create(sale(clienteA), user.id, a);
    const r = await recebimentos.create(receipt(clienteA), user);
    await assert.rejects(vendas.update(String(v._id), { clienteId: clienteB }, user.id, a), /Referencia nao encontrada/);
    await assert.rejects(recebimentos.update(String(r._id), { clienteId: clienteB }, user), /Referencia nao encontrada/);
    assert.equal(String((await db.model('Venda').findById(v._id)).clienteId), clienteA);
    assert.equal(String((await db.model('RecebimentoEquipamento').findById(r._id)).clienteId), clienteA);
  });
  it('nao popula cliente externo em registros antigos na listagem e detalhe', async () => {
    const v = await db.model('Venda').create(sale(clienteB));
    const r = await db.model('RecebimentoEquipamento').create(receipt(clienteB));
    assert.equal((await vendas.findOne(String(v._id), a)).clienteId, null);
    assert.equal((await recebimentos.findOne(String(r._id), a))?.clienteId, null);
    assert.equal((await vendas.findAll(a)).find(x => String(x._id) === String(v._id)).clienteId, null);
    assert.equal((await recebimentos.findAll(a)).find(x => String(x._id) === String(r._id))?.clienteId, null);
  });
  it('referencia inexistente e formato invalido falham sem informar dados de outra empresa', async () => {
    await assert.rejects(vendas.create(sale(new Types.ObjectId().toString()), user.id, a), /Referencia nao encontrada/);
    await assert.rejects(vendas.create(sale('invalido'), user.id, a), /Referencia ou empresa invalida/);
  });
  it('rejeita produto ou servico de outra empresa em itens de venda', async () => {
    const v = await vendas.create(sale(clienteA), user.id, a);
    await assert.rejects(vendas.createItem({
      vendaId: String(v._id),
      tipo: 'produto',
      referenciaId: produtoB,
      quantidade: 1,
      valorUnitario: '10',
      totalItem: '10',
    }, a), /Referencia nao encontrada/);
    await assert.rejects(vendas.createItem({
      vendaId: String(v._id),
      tipo: 'servico',
      referenciaId: servicoB,
      quantidade: 1,
      valorUnitario: '10',
      totalItem: '10',
    }, a), /Referencia nao encontrada/);
    assert.equal(await db.model('ItensVenda').countDocuments({ vendaId: v._id }), 0);
  });
  it('nao permite assumir item antigo de outra empresa ao atualizar vendaId', async () => {
    const vA = await vendas.create(sale(clienteA), user.id, a);
    const vB = await db.model('Venda').create({ empresaId: b, clienteId: clienteB, origemTipo: 'venda_direta', origemId: clienteB, subtotal: '10', total: '10', statusFinanceiro: 'pendente' });
    const itemB = await db.model('ItensVenda').create({
      vendaId: vB._id,
      tipo: 'produto',
      referenciaId: produtoB,
      quantidade: 1,
      valorUnitario: '10',
      totalItem: '10',
    });
    await assert.rejects(vendas.updateItem(String(itemB._id), { vendaId: String(vA._id), referenciaId: produtoA }, a), /Venda nao encontrada/);
    assert.equal(String((await db.model('ItensVenda').findById(itemB._id)).vendaId), String(vB._id));
  });
});
