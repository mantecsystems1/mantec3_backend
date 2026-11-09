import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OrcamentosService } from '../src/orcamentos/orcamentos.service';
import { OrcamentosController } from '../src/orcamentos/orcamentos.controller';
import { Orcamento, OrcamentoSchema } from '../src/orcamentos/schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoSchema } from '../src/orcamentos/schemas/itens-orcamento.schema';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { LogEvento, LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { AuthTokenGuard } from '../src/common/guards/auth-token.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { Reflector } from '@nestjs/core';
import type { CreateOrcamentoCompletoDto } from '../src/orcamentos/dto/create-orcamento-completo.dto';

describe('Orçamento composto — Mongo descartável e HTTP', () => {
  let replica: MongoMemoryReplSet, db: Connection, app: INestApplication, service: OrcamentosService;
  const company = String(new Types.ObjectId()), operator = String(new Types.ObjectId());
  const client = String(new Types.ObjectId()), receipt = String(new Types.ObjectId()), product = String(new Types.ObjectId());
  const user = { empresaId: company, id: operator, _id: operator, sub: operator, nome: 'QA', email: 'qa@example.invalid' };
  const payload = (): CreateOrcamentoCompletoDto => ({ operacaoId: randomUUID(), clienteId: client, recebimentoEquipamentoId: receipt,
    validade: '2026-12-30', descontos: '15.01', itens: [{ tipo: 'produto', referenciaId: product, quantidade: 1, valorUnitario: '10.01' }, { tipo: 'produto', referenciaId: product, quantidade: 2, valorUnitario: '20.02' }] });
  const editPayload = (revisaoEsperada: number, valor = '25.00') => ({ revisaoEsperada, validade: '2027-01-15', descontos: '5.00', observacoes: 'Conferido na assistência',
    itens: [{ tipo: 'produto', referenciaId: product, quantidade: 2, valorUnitario: valor }] });
  const rejectsStatus = (error: unknown, code: number) => (error as { getStatus?: () => number }).getStatus?.() === code;
  before(async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); db = await mongoose.createConnection(replica.getUri()).asPromise();
    for (const name of ['Empresa', 'Cliente', 'Usuario', 'RecebimentoEquipamento', 'Produto', 'Servico']) db.model(name, new Schema({ empresaId: Schema.Types.ObjectId, clienteId: Schema.Types.ObjectId, estadoSalvamento: String, nome: String }));
    await db.model('Cliente').create({ _id: client, empresaId: company, nome: 'Cliente fictício' });
    await db.model('Usuario').create({ _id: operator, empresaId: company, nome: 'Operador fictício' });
    await db.model('RecebimentoEquipamento').create({ _id: receipt, empresaId: company, clienteId: client });
    await db.model('Produto').create({ _id: product, empresaId: company });
    await db.model(Orcamento.name, OrcamentoSchema).init(); db.model(ItensOrcamento.name, ItensOrcamentoSchema);
    const audit = new AuditoriaService(db.model(LogEvento.name, LogEventoSchema) as never);
    service = new OrcamentosService(db.model(Orcamento.name) as never, db.model(ItensOrcamento.name) as never, audit, {} as never);
    const module = await Test.createTestingModule({ controllers: [OrcamentosController], providers: [{ provide: OrcamentosService, useValue: service }] })
      .overrideGuard(AuthTokenGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    // Authentication fixture. Route PermissionGuard, validation, services, audit and DB are real.
    app.use((req: { headers: Record<string, string>; user?: object }, _res: unknown, next: () => void) => { if (req.headers['x-profile']) req.user = { ...user, perfil: req.headers['x-profile'] }; next(); });
    app.useGlobalGuards(new PermissionGuard(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  after(async () => { await app?.close(); await db?.close(); await replica?.stop(); });

  it('salva itens, totais de centavos e auditoria juntos; desconto pode exceder o primeiro item', async () => {
    const body = payload(); const result = await service.createCompleto(body, user);
    assert.ok(result); assert.equal(result.status, 'rascunho'); assert.equal(result.total.toString(), '35.04');
    assert.equal(await db.model(ItensOrcamento.name).countDocuments({ orcamentoId: result._id }), 2);
    assert.equal(await db.model(LogEvento.name).countDocuments({ entidadeId: result._id }), 1);
    const json = JSON.stringify(result); assert.equal(json.includes('operacaoHash'), false); assert.equal(json.includes(body.operacaoId), false);
  });
  it('replay concorrente cria somente um cabeçalho e um conjunto de itens', async () => {
    const body = payload(); const [a, b] = await Promise.all([service.createCompleto(body, user), service.createCompleto(body, user)]);
    assert.equal(String(a!._id), String(b!._id));
    assert.equal(await db.model(Orcamento.name).countDocuments({ operacaoId: body.operacaoId }), 1);
    assert.equal(await db.model(ItensOrcamento.name).countDocuments({ orcamentoId: a!._id }), 2);
    assert.equal(String((await service.porOperacao(body.operacaoId, user))!._id), String(a!._id));
    await assert.rejects(service.createCompleto({ ...body, observacoes: 'Outro conteúdo' }, user), (e) => rejectsStatus(e, 409));
  });
  it('falha na inserção de itens desfaz cabeçalho e auditoria', async () => {
    const logsBefore = await db.model(LogEvento.name).countDocuments();
    const model = db.model(ItensOrcamento.name); const original = model.insertMany;
    const body = payload(); model.insertMany = (() => { throw new Error('Falha de escrita simulada'); }) as typeof model.insertMany;
    try { await assert.rejects(service.createCompleto(body, user), /Falha de escrita/); } finally { model.insertMany = original; }
    assert.equal(await db.model(Orcamento.name).countDocuments({ operacaoId: body.operacaoId }), 0);
    assert.equal(await db.model(LogEvento.name).countDocuments(), logsBefore);
    const retry = await service.createCompleto(body, user); assert.ok(retry);
  });
  it('edita rascunho com cabeçalho, itens, totais e auditoria na mesma operação', async () => {
    const created = await service.createCompleto(payload(), user);
    const revision = Number(created!.__v ?? 0);
    const updated = await service.updateCompleto(String(created!._id), editPayload(revision), user);
    assert.equal(updated!.status, 'rascunho');
    assert.equal(updated!.validade.toISOString().slice(0, 10), '2027-01-15');
    assert.equal(updated!.subtotal.toString(), '50.00');
    assert.equal(updated!.descontos.toString(), '5.00');
    assert.equal(updated!.total.toString(), '45.00');
    assert.equal(Number(updated!.__v), revision + 1);
    assert.equal(await db.model(ItensOrcamento.name).countDocuments({ orcamentoId: created!._id }), 1);
    assert.equal(await db.model(LogEvento.name).countDocuments({ entidadeId: created!._id, tipoEvento: 'ORCAMENTO_ATUALIZADO' }), 1);
  });
  it('edições simultâneas usam revisão esperada e só uma grava o conjunto completo', async () => {
    const created = await service.createCompleto(payload(), user);
    const revision = Number(created!.__v ?? 0);
    const results = await Promise.allSettled([
      service.updateCompleto(String(created!._id), editPayload(revision, '25.00'), user),
      service.updateCompleto(String(created!._id), { ...editPayload(revision, '40.00'), observacoes: 'Outra edição' }, user),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejectsStatus(failed.reason, 409), true);
    const current = await service.findOne(String(created!._id), company);
    const items = await service.findItemsByOrcamento(String(created!._id), company);
    assert.equal(current!.get('__v'), revision + 1);
    assert.equal(items.length, 1);
    assert.ok(['50.00', '80.00'].includes(current!.subtotal.toString()));
  });
  it('rollback conserva rascunho anterior e estados enviados não aceitam edição composta', async () => {
    const created = await service.createCompleto(payload(), user);
    const revision = Number(created!.__v ?? 0);
    const itemsModel = db.model(ItensOrcamento.name); const originalInsert = itemsModel.insertMany;
    itemsModel.insertMany = (() => { throw new Error('Falha ao substituir itens'); }) as typeof itemsModel.insertMany;
    try { await assert.rejects(service.updateCompleto(String(created!._id), editPayload(revision), user), /Falha ao substituir itens/); }
    finally { itemsModel.insertMany = originalInsert; }
    const afterRollback = await service.findOne(String(created!._id), company);
    assert.equal(Number(afterRollback!.__v), revision);
    assert.equal(afterRollback!.total.toString(), '35.04');
    assert.equal(await db.model(ItensOrcamento.name).countDocuments({ orcamentoId: created!._id }), 2);
    await service.update(String(created!._id), { status: 'enviado' }, company);
    const sent = await service.findOne(String(created!._id), company);
    await assert.rejects(service.updateCompleto(String(created!._id), editPayload(Number(sent!.__v)), user), /Apenas orcamento em rascunho/);
  });
  it('recusa item externo, cliente divergente e entrada com anexos pendentes sem salvar', async () => {
    const foreign = String(new Types.ObjectId()); await db.model('Produto').create({ _id: foreign, empresaId: new Types.ObjectId() });
    await assert.rejects(service.createCompleto({ ...payload(), itens: [{ tipo: 'produto', referenciaId: foreign, quantidade: 1, valorUnitario: '20' }] }, user));
    const other = String(new Types.ObjectId()); await db.model('Cliente').create({ _id: other, empresaId: company });
    await assert.rejects(service.createCompleto({ ...payload(), clienteId: other }, user), /não pertence ao cliente/);
    await db.model('RecebimentoEquipamento').updateOne({ _id: receipt }, { estadoSalvamento: 'pendente_midias' });
    try { await assert.rejects(service.createCompleto(payload(), user), /anexos/); }
    finally { await db.model('RecebimentoEquipamento').updateOne({ _id: receipt }, { $unset: { estadoSalvamento: 1 } }); }
  });
  it('isola recuperação por empresa/operador e exige sessão na escrita', async () => {
    const body = payload(); await service.createCompleto(body, user);
    for (const outsider of [{ ...user, empresaId: String(new Types.ObjectId()) }, { ...user, id: String(new Types.ObjectId()) }]) await assert.rejects(service.porOperacao(body.operacaoId, outsider), (e) => rejectsStatus(e, 404));
    await assert.rejects(service.createCompleto(payload()), (e) => rejectsStatus(e, 401));
  });
  it('HTTP aplica guarda e DTO; ignora totais forjados ao não aceitá-los no contrato', async () => {
    await request(app.getHttpServer()).post('/orcamentos/completo').send(payload()).expect(401);
    await request(app.getHttpServer()).post('/orcamentos/completo').set('x-profile', 'estoquista').send(payload()).expect(403);
    await request(app.getHttpServer()).post('/orcamentos/completo').set('x-profile', 'admin_empresa').send({ ...payload(), total: '1' }).expect(400);
    await request(app.getHttpServer()).post('/orcamentos/completo').set('x-profile', 'admin_empresa').send({ ...payload(), itens: [] }).expect(400);
    const body = payload(); const result = await request(app.getHttpServer()).post('/orcamentos/completo').set('x-profile', 'admin_empresa').send(body).expect(201);
    assert.equal(result.body.total.$numberDecimal, '35.04');
    await request(app.getHttpServer()).post('/orcamentos/completo').set('x-profile', 'admin_empresa').send(body).expect(201);
    await request(app.getHttpServer()).get(`/orcamentos/completo/operacoes/${body.operacaoId}`).set('x-profile', 'admin_empresa').expect(200);
    await request(app.getHttpServer()).get(`/orcamentos/completo/operacoes/${body.operacaoId}`).expect(401);
    const draft = await service.createCompleto(payload(), user);
    const revision = Number(draft!.__v ?? 0);
    await request(app.getHttpServer()).patch(`/orcamentos/${draft!._id}/completo`).set('x-profile', 'estoquista').send(editPayload(revision)).expect(403);
    const edited = await request(app.getHttpServer()).patch(`/orcamentos/${draft!._id}/completo`).set('x-profile', 'admin_empresa').send(editPayload(revision)).expect(200);
    assert.equal(edited.body.total.$numberDecimal, '45.00');
    await request(app.getHttpServer()).patch(`/orcamentos/${draft!._id}/completo`).set('x-profile', 'admin_empresa').send({ ...editPayload(revision), total: '1' }).expect(400);
  });
});
