import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { EmpresaSchema } from '../src/core/empresa/schemas/empresa.schema';
import { EmpresaService } from '../src/core/empresa/empresa.service';
import { EmpresaController } from '../src/core/empresa/empresa.controller';
import { ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { PortalClienteService } from '../src/portal-cliente/portal-cliente.service';
import { AuthTokenGuard } from '../src/common/guards/auth-token.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { PagamentoSchema } from '../src/financeiro/pagamentos/schemas/pagamento.schema';
import { MovimentoCaixaSchema } from '../src/financeiro/financeiro-adm/schemas/movimento-caixa.schema';

describe('Pix por empresa: HTTP, persistência, auditoria e portal em Mongo descartável', { timeout: 120000 }, () => {
  let db: Connection, server: MongoMemoryReplSet, app: INestApplication;
  const a = new Types.ObjectId().toString(), b = new Types.ObjectId().toString(), userId = new Types.ObjectId().toString();
  const actorA = { empresaId: a, id: userId, _id: userId, sub: userId, nome: 'QA Pix', email: 'qa@example.invalid', perfil: 'admin_empresa' };
  const pixA = { habilitado: true, tipoChave: 'email', chave: 'pix-a@example.invalid', nomeBeneficiario: 'Empresa A QA', cidadeBeneficiario: 'São Paulo' };
  const pixB = { ...pixA, chave: 'pix-b@example.invalid', nomeBeneficiario: 'Empresa B QA', cidadeBeneficiario: 'Campinas' };
  const customer: Record<string, string> = {};
  const portal = (empresaId: string, clienteId = customer[empresaId]): PortalClienteService => Object.assign(Object.create(PortalClienteService.prototype), {
    verifyToken: async () => ({ empresaId, clienteId }),
    empresaModel: db.model('Empresa'), clienteModel: db.model('Cliente'),
    orcamentoModel: db.model('Orcamento'), ordemServicoModel: db.model('OrdemServico'),
    vendaModel: db.model('Venda'), garantiaModel: db.model('Garantia'),
    itensOrcamentoModel: db.model('ItensOrcamento'), pagamentoModel: db.model('Pagamento'),
    produtoModel: db.model('Produto'), servicoModel: db.model('Servico'), logEventoModel: db.model('LogEvento'),
    configService: { get: () => undefined },
  }) as PortalClienteService;

  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); db = await mongoose.createConnection(server.getUri()).asPromise();
    const empresas = db.model('Empresa', EmpresaSchema), clientes = db.model('Cliente', ClienteSchema);
    const log = db.model('LogEvento', LogEventoSchema);
    db.model('Pagamento', PagamentoSchema);
    db.model('MovimentoCaixa', MovimentoCaixaSchema);
    for (const model of ['Orcamento', 'OrdemServico', 'Venda', 'Garantia', 'ItensOrcamento', 'Produto', 'Servico']) {
      db.model(model, new Schema({ empresaId: Schema.Types.ObjectId, clienteId: Schema.Types.ObjectId, orcamentoId: Schema.Types.ObjectId, vendaId: Schema.Types.ObjectId }, { strict: false }));
    }
    for (const [id, label] of [[a, 'A'], [b, 'B']]) {
      await empresas.create({ _id: id, nomeFantasia: `Empresa ${label} QA`, razaoSocial: `Empresa ${label} QA`, cnpj: label,
        email: `${label}@example.invalid`, telefone: '1100000000', endereco: { logradouro: 'Rua QA', numero: '1', bairro: 'QA', cidade: 'São Paulo', estado: 'SP', cep: '01001000' } });
      customer[id] = String((await clientes.create({ empresaId: id, nome: `Cliente ${label} QA`, cpfCnpj: label }))._id);
    }
    const service = new EmpresaService(empresas as never, new AuditoriaService(log as never));
    const module = await Test.createTestingModule({ controllers: [EmpresaController], providers: [
      { provide: EmpresaService, useValue: service }, PermissionGuard, Reflector,
    ] }).overrideGuard(AuthTokenGuard).useValue({ canActivate: (context) => {
      const req = context.switchToHttp().getRequest();
      const actor = req.headers['x-fixture-actor'];
      if (!['admin-a', 'admin-b', 'gerente-a', 'platform'].includes(actor)) throw new UnauthorizedException();
      req.user = { ...actorA, empresaId: actor === 'admin-b' ? b : a, perfil: actor === 'gerente-a' ? 'gerente' : actor === 'platform' ? 'admin' : 'admin_empresa' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  after(async () => { await app?.close(); await db?.close(); await server?.stop(); });

  it('cadastros antigos retornam pix null, sem CNPJ padrão ou chave inferida', async () => {
    for (const id of [a, b]) assert.equal((await portal(id).getPortal('fixture')).empresa.pix, null);
  });
  it('admin_empresa salva apenas empresa da sessão; portais A/B retornam seus próprios beneficiários', async () => {
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-a').send(pixA).expect(200);
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-b').send(pixB).expect(200);
    for (const [id, own, other] of [[a, pixA, pixB], [b, pixB, pixA]] as const) {
      const result = await portal(id).getPortal('fixture');
      assert.deepEqual(result.empresa.pix, own);
      assert.ok(!JSON.stringify(result).includes(other.chave));
      assert.ok(!('atualizadoPor' in (result.empresa.pix ?? {})));
    }
    assert.equal(await db.model('LogEvento').countDocuments({ tipoEvento: 'EMPRESA_PIX_ATUALIZADO' }), 2);
    const audit = await db.model('LogEvento').findOne({ empresaId: a }).lean<{ usuarioId: Types.ObjectId; dados: Record<string, unknown> } | null>();
    assert.equal(String(audit?.usuarioId), userId); assert.equal(audit?.dados.nomeBeneficiario, pixA.nomeBeneficiario);
    assert.ok(!JSON.stringify(audit).includes(pixA.chave));
    assert.match(String(audit?.dados.chaveHashSha256), /^[a-f0-9]{64}$/);
  });
  it('recusa gerente, usuário sem sessão, alvo de outra empresa e QR/empresa no payload', async () => {
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'gerente-a').send(pixA).expect(403);
    await request(app.getHttpServer()).patch('/empresas/minha/pix').send(pixA).expect(401);
    await request(app.getHttpServer()).patch(`/empresas/${b}/pix`).set('x-fixture-actor', 'admin-a').send(pixA).expect(403);
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-a').send({ ...pixA, empresaId: b }).expect(400);
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-a').send({ ...pixA, qrCodeUrl: 'https://example.invalid/qr' }).expect(400);
    assert.deepEqual((await portal(b).getPortal('fixture')).empresa.pix, pixB);
    assert.equal(await db.model('LogEvento').countDocuments({ tipoEvento: 'EMPRESA_PIX_ATUALIZADO' }), 2);
    await assert.rejects(portal(a, customer[b]).getPortal('fixture'), /nao encontrado/);
  });
  it('recusa configuração incompleta/booleana em string e preserva a anterior', async () => {
    for (const payload of [{ ...pixA, chave: 'invalida' }, { ...pixA, habilitado: 'true' }, { ...pixA, nomeBeneficiario: '' }]) {
      await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-a').send(payload).expect(400);
    }
    assert.deepEqual((await portal(a).getPortal('fixture')).empresa.pix, pixA);
  });
  it('falha na auditoria desfaz a alteração do beneficiário na mesma transação', async () => {
    const service = new EmpresaService(db.model('Empresa') as never, { registrarEventoNegocio: async () => { throw new Error('Auditoria indisponível QA'); } } as never);
    await assert.rejects(service.updatePix(a, { ...pixA, tipoChave: 'email', chave: 'nao-salvar@example.invalid' }, actorA), /Auditoria indisponível/);
    assert.deepEqual((await portal(a).getPortal('fixture')).empresa.pix, pixA);
    assert.equal(await db.model('LogEvento').countDocuments({ tipoEvento: 'EMPRESA_PIX_ATUALIZADO' }), 2);
  });
  it('plataforma pode configurar empresa explicitamente; desabilitar remove chave do portal e é auditado', async () => {
    const changed = { ...pixB, cidadeBeneficiario: 'Santos' };
    await request(app.getHttpServer()).patch(`/empresas/${b}/pix`).set('x-fixture-actor', 'platform').send(changed).expect(200);
    assert.deepEqual((await portal(b).getPortal('fixture')).empresa.pix, changed);
    await request(app.getHttpServer()).patch('/empresas/minha/pix').set('x-fixture-actor', 'admin-a').send({ habilitado: false }).expect(200);
    assert.equal((await portal(a).getPortal('fixture')).empresa.pix, null);
    assert.equal((await db.model('Empresa').findById(a))?.get('pix.chave'), undefined);
    assert.equal(await db.model('LogEvento').countDocuments({ empresaId: a, 'dados.habilitado': false }), 1);
  });
  it('portal calcula parcial com pagamentos válidos e exclui caixa estornado ou de outra empresa', async () => {
    const venda = await db.model('Venda').create({ empresaId: a, clienteId: customer[a], origemTipo: 'venda_direta', total: '100', subtotal: '100', statusFinanceiro: 'pago' });
    const valid = await db.model('Pagamento').create({ vendaId: venda._id, formaPagamento: 'dinheiro', valor: '40', dataPagamento: new Date() });
    for (const [empresaId, status] of [[a, 'estornado'], [b, 'confirmado']]) {
      const pagamentoId = new Types.ObjectId(), movimentoId = new Types.ObjectId();
      await db.model('Pagamento').create({ _id: pagamentoId, vendaId: venda._id, formaPagamento: 'pix', valor: '60', dataPagamento: new Date(), movimentoCaixaId: movimentoId });
      await db.model('MovimentoCaixa').collection.insertOne({ _id: movimentoId, empresaId: new Types.ObjectId(empresaId), status, origemTipo: 'pagamento_venda', origemId: pagamentoId, valor: Types.Decimal128.fromString('60') });
    }
    const result = await portal(a).getPortal('fixture');
    assert.equal(result.vendas[0].statusFinanceiro, 'parcial'); assert.equal(result.vendas[0].totalPago, 40);
    assert.equal(result.vendas[0].pagamentos.length, 1); assert.equal(result.vendas[0].pagamentos[0].id, String(valid._id));
    assert.equal(result.atendimentos[0].pagamentoStatus, 'parcial');
    assert.equal((await db.model('Venda').findById(venda._id))?.get('statusFinanceiro'), 'pago');
  });
});
