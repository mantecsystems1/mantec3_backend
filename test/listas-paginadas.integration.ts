import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ClientesService } from '../src/clientes/clientes.service';
import { ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { ProdutosService } from '../src/catalogo/produtos/produtos.service';
import { ProdutoSchema } from '../src/catalogo/produtos/schemas/produto.schema';

describe('Listas de clientes e produtos paginadas no servidor', { timeout: 120000 }, () => {
  let server: MongoMemoryReplSet, db: Connection, clientes: ClientesService, produtos: ProdutosService;
  const a = new Types.ObjectId().toString(), b = new Types.ObjectId().toString();

  before(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    const clienteModel = db.model('Cliente', ClienteSchema);
    const produtoModel = db.model('Produto', ProdutoSchema);
    db.model('AparelhoModelo', new Schema({ marca: String, modelo: String, aliases: [String] }));
    const docs = Array.from({ length: 30 }, (_, i) => ({
      empresaId: a, nome: `Cliente ${String(i).padStart(2, '0')}`, cpfCnpj: `100000000${String(i).padStart(2, '0')}`,
      telefone: `1199999${String(i).padStart(4, '0')}`, ativo: i % 10 !== 0,
    }));
    await clienteModel.insertMany([...docs, { empresaId: b, nome: 'Cliente 01 da outra empresa', cpfCnpj: '99999999999' }]);
    await produtoModel.insertMany([
      ...Array.from({ length: 27 }, (_, i) => ({ empresaId: a, nome: `Tela ${i}`, codigoInterno: `TL-${i}` })),
      { empresaId: a, nome: 'Tela inativa', ativo: false },
      { empresaId: b, nome: 'Tela de outra empresa' },
    ]);
    clientes = new ClientesService(clienteModel as never, { registrarEventoNegocio: async () => undefined } as never);
    produtos = new ProdutosService(produtoModel as never);
  });
  after(async () => { await db?.close(); await server?.stop(); });

  it('pagina clientes da empresa em ordem de nome, sem misturar outra empresa', async () => {
    const primeira = await clientes.findAllPaginado(a, { pagina: '1', limite: '25' });
    const segunda = await clientes.findAllPaginado(a, { pagina: '2', limite: '25' });
    assert.equal(primeira.total, 30);
    assert.equal(primeira.totalPaginas, 2);
    assert.equal(primeira.itens.length, 25);
    assert.equal(segunda.itens.length, 5);
    assert.equal(primeira.itens[0].nome, 'Cliente 00');
    assert.ok([...primeira.itens, ...segunda.itens].every((c) => String(c.empresaId) === a));
  });

  it('busca por nome, telefone formatado ou documento além da primeira página', async () => {
    assert.equal((await clientes.findAllPaginado(a, { busca: 'Cliente 29' })).itens[0]?.nome, 'Cliente 29');
    assert.equal((await clientes.findAllPaginado(a, { busca: '(11) 99999-0027' })).itens[0]?.nome, 'Cliente 27');
    assert.equal((await clientes.findAllPaginado(a, { busca: '100.000.000-26' })).itens[0]?.nome, 'Cliente 26');
    assert.equal((await clientes.findAllPaginado(a, { busca: '10000000026' })).itens[0]?.nome, 'Cliente 26');
    assert.equal((await clientes.findAllPaginado(a, { busca: 'outra empresa' })).total, 0);
  });

  it('filtra ativos e inativos e recusa situação desconhecida', async () => {
    assert.equal((await clientes.findAllPaginado(a, { status: 'inativo' })).total, 3);
    assert.equal((await clientes.findAllPaginado(a, { status: 'ativo' })).total, 27);
    await assert.rejects(clientes.findAllPaginado(a, { status: 'bloqueado' }), /situação/);
    await assert.rejects(clientes.findAllPaginado(a, { limite: '1000' }), /limite/);
  });

  it('pagina produtos ativos da empresa e exige empresa', async () => {
    const pagina = await produtos.findAllPaginado(a, { limite: '10' });
    assert.equal(pagina.total, 27);
    assert.equal(pagina.totalPaginas, 3);
    assert.equal((await produtos.findAllPaginado(a, { busca: 'TL-26' })).itens[0]?.nome, 'Tela 26');
    assert.equal((await produtos.findAllPaginado(a, { busca: 'inativa' })).total, 0);
    assert.equal((await produtos.findAllPaginado(a, { busca: 'outra empresa' })).total, 0);
    await assert.rejects(produtos.findAllPaginado(undefined, {}), /Empresa/);
  });
});
