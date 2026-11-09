import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { VendasService } from '../src/financeiro/vendas/vendas.service';
import { RecebimentoEquipamentoService } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.service';
import { VendaSchema } from '../src/financeiro/vendas/schemas/venda.schema';
import { OperacaoVendaSchema } from '../src/financeiro/vendas/schemas/operacao-venda.schema';
import { ItensVendaSchema } from '../src/financeiro/vendas/schemas/itens-venda.schema';
import { ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { RecebimentoEquipamentoSchema } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { OsService } from '../src/ordens-servico/os.service';
import { OrdemServicoSchema } from '../src/ordens-servico/schemas/ordem-servico.schema';
import { OrcamentosService } from '../src/orcamentos/orcamentos.service';
import { OrcamentoSchema } from '../src/orcamentos/schemas/orcamento.schema';
import { ItensOrcamentoSchema } from '../src/orcamentos/schemas/itens-orcamento.schema';
import { PortalClienteService } from '../src/portal-cliente/portal-cliente.service';

describe('Referencias de cliente isoladas por empresa em Mongo descartavel', { timeout: 120000 }, () => {
  let server: MongoMemoryReplSet, db: Connection, vendas: VendasService, recebimentos: RecebimentoEquipamentoService;
  const a = new Types.ObjectId().toString(), b = new Types.ObjectId().toString();
  let clienteA: string, clienteB: string, produtoA: string, produtoB: string, servicoB: string;
  const actorId = new Types.ObjectId().toString();
  const user = { empresaId: a, id: actorId, _id: actorId, sub: actorId, nome: 'QA', email: 'qa@example.invalid' };
  const sale = (clienteId: string) => ({ empresaId: a, clienteId, origemTipo: 'venda_direta', origemId: clienteId, subtotal: '10', total: '10', statusFinanceiro: 'pendente' });
  const receipt = (clienteId: string) => ({ empresaId: a, clienteId, recebidoPor: user.id, tipoEquipamento: 'teste', marca: 'teste', modelo: 'teste', dataRecebimento: new Date(), status: 'recebido' });
  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); db = await mongoose.createConnection(server.getUri()).asPromise();
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
    vendas = new VendasService(db.model('Venda', VendaSchema) as never, db.model('ItensVenda', ItensVendaSchema) as never, audit, finance, db.model('OperacaoVenda', OperacaoVendaSchema) as never);
    const ordemServicoModel = db.model('OrdemServico', OrdemServicoSchema);
    const orcamentoModel = db.model('Orcamento', OrcamentoSchema);
    recebimentos = new RecebimentoEquipamentoService(
      db.model('RecebimentoEquipamento', RecebimentoEquipamentoSchema) as never,
      child as never, child as never, child as never, child as never, audit,
      ordemServicoModel as never, orcamentoModel as never,
    );
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

describe('OS e orcamentos isolam todas as referencias por empresa', { timeout: 120000 }, () => {
  let server: MongoMemoryReplSet, db: Connection, os: OsService, orcamentos: OrcamentosService;
  const a = new Types.ObjectId().toString(), b = new Types.ObjectId().toString();
  const own: Record<string, string> = {}, other: Record<string, string> = {};
  const quote = (refs = own) => ({
    empresaId: a, clienteId: refs.clienteId, recebimentoEquipamentoId: refs.recebimentoEquipamentoId,
    criadoPor: refs.tecnicoId, status: 'rascunho', validade: '2026-12-01', subtotal: '10', total: '10',
  });
  const order = () => ({
    empresaId: a, clienteId: own.clienteId, recebimentoEquipamentoId: own.recebimentoEquipamentoId,
    tecnicoId: own.tecnicoId, statusOperacional: 'aberta', prioridade: 'normal', dataEntrada: '2026-11-06',
  });
  const user = () => ({ empresaId: a, id: own.tecnicoId, _id: own.tecnicoId, sub: own.tecnicoId, nome: 'QA', email: 'qa@example.invalid' });

  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    const clientes = db.model('Cliente', ClienteSchema);
    const usuarios = db.model('Usuario', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    const recebimentos = db.model('RecebimentoEquipamento', RecebimentoEquipamentoSchema);
    const quotes = db.model('Orcamento', OrcamentoSchema);
    const orders = db.model('OrdemServico', OrdemServicoSchema);
    const itens = db.model('ItensOrcamento', ItensOrcamentoSchema);
    const empresas = db.model('Empresa', new Schema({ nomeFantasia: String }));
    await empresas.create({ _id: a, nomeFantasia: 'Empresa QA A' });
    const produtos = db.model('Produto', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    const servicos = db.model('Servico', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    db.model('Fornecedor', new Schema({ empresaId: Schema.Types.ObjectId, nome: String }));
    db.model('Venda', new Schema({ empresaId: Schema.Types.ObjectId, clienteId: Schema.Types.ObjectId }));
    db.model('Pagamento', new Schema({ vendaId: Schema.Types.ObjectId }));
    db.model('Garantia', new Schema({ empresaId: Schema.Types.ObjectId, clienteId: Schema.Types.ObjectId }));
    db.model('LogEvento', new Schema({ empresaId: Schema.Types.ObjectId }));
    for (const [empresaId, refs, label] of [[a, own, 'A'], [b, other, 'B']] as const) {
      refs.clienteId = String((await clientes.create({ empresaId, nome: `Cliente ${label}`, cpfCnpj: label }))._id);
      refs.tecnicoId = String((await usuarios.create({ empresaId, nome: `Tecnico ${label}` }))._id);
      refs.recebimentoEquipamentoId = String((await recebimentos.create({
        empresaId, clienteId: refs.clienteId, recebidoPor: refs.tecnicoId, tipoEquipamento: 'Celular',
        marca: label, modelo: label, dataRecebimento: new Date(), status: 'recebido',
      }))._id);
      refs.orcamentoId = String((await quotes.create({ ...quote(refs), empresaId }))._id);
      refs.produtoId = String((await produtos.create({ empresaId, nome: label === 'A' ? 'Peca A' : 'SEGREDO_PRODUTO_B' }))._id);
      refs.servicoId = String((await servicos.create({ empresaId, nome: label === 'A' ? 'Servico A' : 'SEGREDO_SERVICO_B' }))._id);
    }
    const audit = { registrarEventoNegocio: async () => undefined } as never;
    os = new OsService(orders as never, {} as never, {} as never, {} as never, audit, {} as never);
    orcamentos = new OrcamentosService(quotes as never, itens as never, audit, os);
  });
  after(async () => { await db?.close(); await server?.stop(); });

  it('permite criar, consultar e editar referencias da propria empresa', async () => {
    const q = await orcamentos.create(quote(), user());
    const o = await os.create({ ...order(), orcamentoId: String(q._id) }, a);
    await orcamentos.update(String(q._id), { clienteId: own.clienteId }, a);
    await os.update(String(o._id), { tecnicoId: own.tecnicoId }, a);
    const foundQuote = await orcamentos.findOne(String(q._id), a);
    const foundOrder = await os.findOne(String(o._id), a);
    assert.ok(foundQuote);
    assert.ok(foundOrder);
    assert.equal(foundQuote.get('clienteId.nome'), 'Cliente A');
    assert.equal(foundOrder.get('tecnicoId.nome'), 'Tecnico A');
  });

  it('rejeita criacao de OS com cada referencia externa antes de gravar', async () => {
    const count = await db.model('OrdemServico').countDocuments();
    for (const campo of ['clienteId', 'tecnicoId', 'recebimentoEquipamentoId', 'orcamentoId'] as const) {
      await assert.rejects(os.create({ ...order(), [campo]: other[campo] }, a), /Referencia nao encontrada/);
    }
    assert.equal(await db.model('OrdemServico').countDocuments(), count);
  });

  it('rejeita criacao de orcamento com cliente, recebimento ou autor externo', async () => {
    const count = await db.model('Orcamento').countDocuments();
    for (const campo of ['clienteId', 'recebimentoEquipamentoId'] as const) {
      await assert.rejects(orcamentos.create({ ...quote(), [campo]: other[campo] }, user()), /Referencia nao encontrada/);
    }
    await assert.rejects(orcamentos.create({ ...quote(), criadoPor: other.tecnicoId }, { ...user(), id: other.tecnicoId, _id: other.tecnicoId, sub: other.tecnicoId }), /Referencia nao encontrada/);
    assert.equal(await db.model('Orcamento').countDocuments(), count);
  });

  it('rejeita troca de referencias em OS e orcamento sem alterar o registro', async () => {
    const q = await orcamentos.create(quote(), user());
    const o = await os.create(order(), a);
    for (const campo of ['clienteId', 'tecnicoId', 'recebimentoEquipamentoId', 'orcamentoId'] as const) {
      await assert.rejects(os.update(String(o._id), { [campo]: other[campo] }, a), /Referencia nao encontrada/);
    }
    for (const [campo, id] of [['clienteId', other.clienteId], ['recebimentoEquipamentoId', other.recebimentoEquipamentoId], ['criadoPor', other.tecnicoId]]) {
      await assert.rejects(orcamentos.update(String(q._id), { [campo]: id }, a), /Referencia nao encontrada/);
    }
    assert.equal(String((await db.model('OrdemServico').findById(o._id)).clienteId), own.clienteId);
    assert.equal(String((await db.model('Orcamento').findById(q._id)).clienteId), own.clienteId);
  });

  it('oculta dados externos em registros legados, na lista, detalhe e busca por orcamento', async () => {
    const q = await db.model('Orcamento').create(quote(other));
    const o = await db.model('OrdemServico').create({ ...order(), ...other });
    const quoteRecords = [await orcamentos.findOne(String(q._id), a), ...(await orcamentos.findAll(a)).filter(item => String(item._id) === String(q._id))];
    for (const record of quoteRecords) {
      assert.ok(record);
      assert.equal(record.clienteId, null);
      assert.equal(record.recebimentoEquipamentoId, null);
      assert.equal(record.criadoPor, null);
    }
    const orderRecords = [await os.findOne(String(o._id), a), await os.findByOrcamento(other.orcamentoId, a), ...(await os.findAll(a)).filter(item => String(item._id) === String(o._id))];
    for (const record of orderRecords) {
      assert.ok(record);
      assert.equal(record.clienteId, null);
      assert.equal(record.recebimentoEquipamentoId, null);
      assert.equal(record.tecnicoId, null);
      assert.equal(record.orcamentoId, null);
    }
  });

  it('nao permite consultar registros ou orcamento sem escopo de empresa', async () => {
    assert.throws(() => os.findByOrcamento(own.orcamentoId), /Empresa/);
    assert.equal(await os.findOne(new Types.ObjectId().toString(), b), null);
    await assert.rejects(os.create({ ...order(), clienteId: 'invalido' }, a), /Referencia ou empresa invalida/);
  });

  it('itens aceitam catalogo proprio e rejeitam criacao e troca por catalogo externo', async () => {
    const q = await orcamentos.create(quote(), user());
    for (const [tipo, campo] of [['produto', 'produtoId'], ['servico', 'servicoId']] as const) {
      const dto = { orcamentoId: String(q._id), tipo, referenciaId: own[campo], quantidade: 1, valorUnitario: '10', totalItem: '10' };
      const item = await orcamentos.createItem(dto, a);
      await assert.rejects(orcamentos.createItem({ ...dto, referenciaId: other[campo] }, a), /Referencia nao encontrada/);
      await assert.rejects(orcamentos.updateItem(String(item._id), { referenciaId: other[campo] }, a), /Referencia nao encontrada/);
      assert.equal(String((await db.model('ItensOrcamento').findById(item._id)).referenciaId), own[campo]);
    }
    assert.equal(await db.model('ItensOrcamento').countDocuments({ orcamentoId: q._id }), 2);
  });

  it('portal nao resolve equipamento ou descricoes de catalogo externas em dados legados', async () => {
    const q = await db.model('Orcamento').create({ ...quote(), recebimentoEquipamentoId: other.recebimentoEquipamentoId });
    const o = await db.model('OrdemServico').create({ ...order(), recebimentoEquipamentoId: other.recebimentoEquipamentoId });
    for (const [tipo, campo] of [['produto', 'produtoId'], ['servico', 'servicoId']] as const) {
      await db.model('ItensOrcamento').create({ orcamentoId: q._id, tipo, referenciaId: other[campo], quantidade: 1, valorUnitario: '10', totalItem: '10' });
    }
    const portal = Object.assign(Object.create(PortalClienteService.prototype), {
      verifyToken: async () => ({ empresaId: a, clienteId: own.clienteId }),
      empresaModel: db.model('Empresa'), clienteModel: db.model('Cliente'),
      orcamentoModel: db.model('Orcamento'), itensOrcamentoModel: db.model('ItensOrcamento'),
      ordemServicoModel: db.model('OrdemServico'), vendaModel: db.model('Venda'),
      pagamentoModel: db.model('Pagamento'), garantiaModel: db.model('Garantia'),
      produtoModel: db.model('Produto'), servicoModel: db.model('Servico'),
      logEventoModel: db.model('LogEvento'), configService: { get: () => undefined },
    }) as PortalClienteService;
    const response = await portal.getPortal('token-de-teste');
    assert.equal(response.orcamentos.find(item => item.id === String(q._id))?.recebimentoEquipamentoId, null);
    assert.equal(response.ordensServico.find(item => item.id === String(o._id))?.recebimentoEquipamentoId, null);
    assert.equal(JSON.stringify(response).includes('SEGREDO_PRODUTO_B'), false);
    assert.equal(JSON.stringify(response).includes('SEGREDO_SERVICO_B'), false);
  });
});
