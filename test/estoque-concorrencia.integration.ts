import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EstoqueService } from '../src/estoque/estoque.service';
import { MovimentosEstoqueSchema } from '../src/estoque/schemas/movimento-estoque.schema';
import { SaldoEstoqueSchema } from '../src/estoque/schemas/saldo-estoque.schema';
import { ProdutoSchema } from '../src/catalogo/produtos/schemas/produto.schema';
import { MOVIMENTO_ESTOQUE_ORIGEM, MOVIMENTO_ESTOQUE_TIPO } from '../src/estoque/movimento-estoque.types';

describe('Estoque concorrente com saldo atomico em Mongo descartavel', { timeout: 120000 }, () => {
  let server: MongoMemoryServer, db: Connection, estoque: EstoqueService;
  const empresaId = new Types.ObjectId().toString();
  let produtoId: string;

  before(async () => {
    server = await MongoMemoryServer.create();
    db = await mongoose.createConnection(server.getUri()).asPromise();
    const movimentos = db.model('MovimentosEstoque', MovimentosEstoqueSchema);
    const saldos = db.model('SaldoEstoque', SaldoEstoqueSchema);
    const produtos = db.model('Produto', ProdutoSchema);
    produtoId = String((await produtos.create({ empresaId, nome: 'Tela Teste' }))._id);
    estoque = new EstoqueService(movimentos as never, saldos as never, produtos as never, { registrarEventoNegocio: async () => undefined } as never);
  });

  after(async () => {
    await db?.close();
    await server?.stop();
  });

  it('aceita somente uma saida concorrente quando existe uma unidade disponivel', async () => {
    await estoque.create({
      empresaId,
      produtoId,
      tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
      quantidade: 1,
      origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.AJUSTE_MANUAL,
      origemId: new Types.ObjectId().toString(),
    }, 'user', empresaId);

    const tentativas = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => estoque.create({
      empresaId,
      produtoId,
      tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA,
      quantidade: 1,
      origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.AJUSTE_MANUAL,
      origemId: new Types.ObjectId().toString(),
    }, 'user', empresaId)));

    assert.equal(tentativas.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(await db.model('MovimentosEstoque').countDocuments({ tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA }), 1);
    const saldo = await db.model('SaldoEstoque').findOne({ empresaId, produtoId }).lean() as { saldoFisico: number; disponivel: number; reservado: number } | null;
    assert.ok(saldo);
    assert.equal(saldo.saldoFisico, 0);
    assert.equal(saldo.disponivel, 0);
    assert.equal(saldo.reservado, 0);
  });
});
