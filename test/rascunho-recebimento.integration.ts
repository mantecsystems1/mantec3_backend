import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import type { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';
import { RascunhoRecebimento, RascunhoRecebimentoSchema, type RascunhoRecebimentoDocument } from '../src/recebimento/rascunhos/rascunho-recebimento.schema';
import { RascunhoRecebimentoService } from '../src/recebimento/rascunhos/rascunho-recebimento.service';
import { RascunhoRecebimentoController } from '../src/recebimento/rascunhos/rascunho-recebimento.controller';
import type { SalvarRascunhoRecebimentoDto } from '../src/recebimento/rascunhos/salvar-rascunho.dto';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema, type RecebimentoEquipamentoDocument } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { CondicoesEquipamento, CondicoesEquipamentoSchema } from '../src/recebimento/condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesSchema } from '../src/recebimento/componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoSchema } from '../src/recebimento/midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoSchema } from '../src/recebimento/termos/termos-recebimento.schema';
import { LogEvento, LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { RecebimentoCompletoService } from '../src/recebimento/recebimento-equipamento/recebimento-completo.service';
import { RecebimentoEquipamentoController } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.controller';
import { RecebimentoEquipamentoService } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.service';
import type { CreateRecebimentoCompletoDto } from '../src/recebimento/recebimento-equipamento/dto/create-recebimento-completo.dto';

describe('Rascunho de recebimento isolado e convertido atomicamente — Mongo descartavel', () => {
  let server: MongoMemoryReplSet;
  let db: Connection;
  let drafts: RascunhoRecebimentoService;
  let complete: RecebimentoCompletoService;
  let app: INestApplication;
  const empresaId = String(new Types.ObjectId());
  const operadorId = String(new Types.ObjectId());
  const clienteId = String(new Types.ObjectId());
  const actor = { id: operadorId, empresaId } as CurrentUserPayload;
  const body = (modelo = 'Modelo em preenchimento', revisaoEsperada = 0): SalvarRascunhoRecebimentoDto => ({ revisaoEsperada, dados: { etapa: 2, form: { clienteId, tipoEquipamento: 'Celular', marca: 'Marca', modelo, signatarioDocumento: 'Documento privado' }, midias: [{ tipo: 'foto', nomeOriginal: 'tela.png', mimeType: 'image/png', tamanhoBytes: 8 }] } });
  const command = (operacaoId: string, rascunhoRevisao?: number): CreateRecebimentoCompletoDto => ({
    operacaoId, rascunhoRevisao, recebimento: { empresaId, clienteId, recebidoPor: operadorId, tipoEquipamento: 'Celular', marca: 'Marca', modelo: 'Modelo', status: 'recebido', dataRecebimento: new Date('2026-11-08T12:00:00Z') },
    condicoes: [{ categoria: 'Tela', tipo: 'Risco', severidade: 'baixa' }], componentesAusentes: [{ nomeComponente: 'Capa' }], termo: { texto: 'Termo QA', assinado: false },
  });
  const status = (value: unknown, expected: number) => (value as { getStatus?: () => number }).getStatus?.() === expected;

  before(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    db.model('Cliente', new Schema({ empresaId: Schema.Types.ObjectId }));
    for (const [name, schema] of [
      [RascunhoRecebimento.name, RascunhoRecebimentoSchema], [RecebimentoEquipamento.name, RecebimentoEquipamentoSchema],
      [CondicoesEquipamento.name, CondicoesEquipamentoSchema], [ComponentesAusentes.name, ComponentesAusentesSchema],
      [MidiasRecebimento.name, MidiasRecebimentoSchema], [TermosRecebimento.name, TermosRecebimentoSchema], [LogEvento.name, LogEventoSchema],
    ] as const) await db.model(name, schema).init();
    await db.model('Cliente').create({ _id: clienteId, empresaId });
    drafts = new RascunhoRecebimentoService(db.model<RascunhoRecebimentoDocument>(RascunhoRecebimento.name));
    complete = new RecebimentoCompletoService(db.model<RecebimentoEquipamentoDocument>(RecebimentoEquipamento.name));
    const module = await Test.createTestingModule({ controllers: [RascunhoRecebimentoController, RecebimentoEquipamentoController], providers: [
      { provide: RascunhoRecebimentoService, useValue: drafts }, { provide: RecebimentoCompletoService, useValue: complete },
      { provide: RecebimentoEquipamentoService, useValue: {} },
    ] }).compile();
    app = module.createNestApplication();
    // Authentication fixture only: real event guard, DTO validation, service and database execute.
    app.use((req: { headers: Record<string, string>; user?: object }, _res: unknown, next: () => void) => {
      if (req.headers['x-test-profile']) req.user = { ...actor, perfil: req.headers['x-test-profile'], id: req.headers['x-test-operator'] || operadorId, empresaId: req.headers['x-test-company'] || empresaId };
      next();
    });
    app.useGlobalGuards(new PermissionGuard(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  after(async () => { await app?.close(); await db?.close(); await server?.stop(); });

  it('salva parcial, retoma o progresso e replay nao altera revisao nem duplica', async () => {
    const id = randomUUID();
    const first = await drafts.salvar(id, body(), actor);
    const retry = await drafts.salvar(id, body(), actor);
    assert.equal(first.revisao, 1);
    assert.equal(retry.revisao, 1);
    assert.equal(retry.dados?.etapa, 2);
    assert.equal((await drafts.carregar(id, actor)).dados?.form?.modelo, 'Modelo em preenchimento');
    assert.equal(await db.model(RascunhoRecebimento.name).countDocuments({ operacaoId: id }), 1);
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 0);
  });

  it('revisao impede sobrescrita obsoleta e mantem somente a versao confirmada', async () => {
    const id = randomUUID();
    await drafts.salvar(id, body(), actor);
    const updated = await drafts.salvar(id, body('Modelo revisado', 1), actor);
    assert.equal(updated.revisao, 2);
    await assert.rejects(drafts.salvar(id, body('Versao antiga', 1), actor), (error) => status(error, 409));
    assert.equal((await drafts.carregar(id, actor)).dados?.form?.modelo, 'Modelo revisado');
  });

  it('duas abas concorrentes recebem um vencedor e um conflito sem perder a revisao', async () => {
    const id = randomUUID();
    await drafts.salvar(id, body(), actor);
    const results = await Promise.allSettled([drafts.salvar(id, body('Aba A', 1), actor), drafts.salvar(id, body('Aba B', 1), actor)]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = results.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    assert.ok(status(rejected.reason, 409));
    assert.equal((await drafts.carregar(id, actor)).revisao, 2);
  });

  it('criacao concorrente identica e idempotente', async () => {
    const id = randomUUID();
    const saved = await Promise.all([drafts.salvar(id, body(), actor), drafts.salvar(id, body(), actor)]);
    assert.deepEqual(saved.map((item) => item.revisao), [1, 1]);
    assert.equal(await db.model(RascunhoRecebimento.name).countDocuments({ operacaoId: id }), 1);
  });

  it('listagem omite documento e demais campos privados e escopo isola empresa e operador', async () => {
    const id = randomUUID();
    const data = body('Resumo legivel');
    data.dados.form!.observacoesGerais = 'Data: 08/11/2026';
    await drafts.salvar(id, data, actor);
    const summary = (await drafts.listar(actor)).find((item) => item.operacaoId === id);
    assert.equal(summary?.equipamento, 'Celular Marca Resumo legivel');
    assert.equal('dados' in summary!, false);
    assert.equal(JSON.stringify(summary).includes('Documento privado'), false);
    for (const outsider of [{ ...actor, empresaId: String(new Types.ObjectId()) }, { ...actor, id: String(new Types.ObjectId()) }]) {
      await assert.rejects(drafts.carregar(id, outsider), (error) => status(error, 404));
      assert.equal((await drafts.listar(outsider)).some((item) => item.operacaoId === id), false);
    }
    await assert.rejects(drafts.listar(), (error) => status(error, 401));
  });

  it('rejeita cliente de outra empresa antes de salvar qualquer dado', async () => {
    const id = randomUUID(), foreign = String(new Types.ObjectId());
    await db.model('Cliente').create({ _id: foreign, empresaId: new Types.ObjectId() });
    await assert.rejects(drafts.salvar(id, { revisaoEsperada: 0, dados: { form: { clienteId: foreign } } }, actor), (error) => status(error, 404));
    assert.equal(await db.model(RascunhoRecebimento.name).countDocuments({ operacaoId: id }), 0);
  });

  it('HTTP exige sessao e permissao real e valida UUID', async () => {
    const url = `/rascunhos-recebimento/${randomUUID()}`;
    await request(app.getHttpServer()).put(url).send(body()).expect(401);
    await request(app.getHttpServer()).put(url).set('x-test-profile', 'tecnico').send(body()).expect(403);
    await request(app.getHttpServer()).get('/rascunhos-recebimento').set('x-test-profile', 'sem-permissao').expect(403);
    await request(app.getHttpServer()).get('/rascunhos-recebimento').set('x-test-profile', 'tecnico').expect(200);
    await request(app.getHttpServer()).get('/rascunhos-recebimento/invalido').set('x-test-profile', 'recebimento').expect(400);
    await request(app.getHttpServer()).put(url).set('x-test-profile', 'recebimento').send(body()).expect(200);
    await request(app.getHttpServer()).get(url).set('x-test-profile', 'recebimento').set('x-test-operator', String(new Types.ObjectId())).expect(404);
    await request(app.getHttpServer()).get(url).set('x-test-profile', 'recebimento').set('x-test-company', String(new Types.ObjectId())).expect(404);
  });

  it('HTTP rejeita assinatura, consentimento, objetos binarios, excesso e campos desconhecidos', async () => {
    const bad = [
      { form: { assinaturaImagemBase64: 'assinatura' } }, { form: { termoAssinado: true } },
      { form: { observacoesGerais: 'data:image/png;base64,AAAA' } }, { midias: [{ urlArquivo: 'blob:local' }] },
      { midias: [{ arquivo: { name: 'foto.png' } }] }, { midias: Array.from({ length: 6 }, () => ({ tipo: 'foto' })) },
      { form: { modelo: 'x'.repeat(121) } }, { form: { termoTexto: 'a'.repeat(8000) }, condicoes: Array.from({ length: 40 }, () => ({ observacoes: 'frase '.repeat(300) })) },
      { etapa: 5 }, { form: null }, { form: { observacoesGerais: 'A'.repeat(400) } },
    ];
    for (const dados of bad) {
      const id = randomUUID();
      await request(app.getHttpServer()).put(`/rascunhos-recebimento/${id}`).set('x-test-profile', 'recebimento').send({ revisaoEsperada: 0, dados }).expect(400);
      assert.equal(await db.model(RascunhoRecebimento.name).countDocuments({ operacaoId: id }), 0);
    }
  });

  it('HTTP preserva severidade critica do formulario no rascunho, retomada e cadastro final', async () => {
    const id = randomUUID();
    const condicoes = [{ categoria: 'Bateria', tipo: 'Estufada', severidade: 'critica', observacoes: 'Relato do recebimento' }];
    const draft = { ...body(), dados: { ...body().dados, condicoes } };
    const first = await request(app.getHttpServer()).put(`/rascunhos-recebimento/${id}`).set('x-test-profile', 'recebimento').send(draft).expect(200);
    assert.equal(first.body.dados.condicoes[0].severidade, 'critica');
    const restored = await request(app.getHttpServer()).get(`/rascunhos-recebimento/${id}`).set('x-test-profile', 'recebimento').expect(200);
    assert.deepEqual(restored.body.dados.condicoes, condicoes);
    const final = await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'recebimento').send({ ...command(id, restored.body.revisao), condicoes: restored.body.dados.condicoes }).expect(201);
    assert.equal(final.body.condicoes[0].severidade, 'critica');
    assert.equal(final.body.condicoes[0].observacoes, 'Relato do recebimento');
    const converted = await request(app.getHttpServer()).get(`/rascunhos-recebimento/${id}`).set('x-test-profile', 'recebimento').expect(200);
    assert.equal(converted.body.estado, 'convertido');
    assert.equal(converted.body.recebimentoId, final.body.recebimento._id);
    assert.equal(converted.body.dados, null);
  });

  it('cadastro final exige a revisao vigente e converte na mesma transacao', async () => {
    const id = randomUUID();
    await drafts.salvar(id, body(), actor);
    await assert.rejects(complete.create(command(id), actor), (error) => status(error, 409));
    await assert.rejects(complete.create(command(id, 0), actor), (error) => status(error, 409));
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 0);
    const saved = await complete.create(command(id, 1), actor);
    const draft = await drafts.carregar(id, actor);
    assert.equal(draft.estado, 'convertido');
    assert.equal(draft.dados, null);
    assert.equal(draft.recebimentoId, String(saved.recebimento._id));
    assert.equal((await drafts.listar(actor)).some((item) => item.operacaoId === id), false);
    const stored = await db.model<RascunhoRecebimento>(RascunhoRecebimento.name).findOne({ operacaoId: id }).lean().exec();
    assert.deepEqual(stored?.dados, {});
    await assert.rejects(drafts.salvar(id, body('Aba antiga', 1), actor), (error) => status(error, 409));
    const replay = await complete.create(command(id, 1), actor);
    assert.equal(String(replay.recebimento._id), String(saved.recebimento._id));
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 1);
  });

  it('falha na gravacao final preserva dados e revisao do rascunho', async () => {
    const id = randomUUID();
    await drafts.salvar(id, body('Antes da falha'), actor);
    const invalid = command(id, 1);
    invalid.componentesAusentes = [{ nomeComponente: '' }];
    await assert.rejects(complete.create(invalid, actor));
    const draft = await drafts.carregar(id, actor);
    assert.equal(draft.estado, 'rascunho');
    assert.equal(draft.revisao, 1);
    assert.equal(draft.dados?.form?.modelo, 'Antes da falha');
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 0);
  });

  it('corrida entre autosave e cadastro nunca converte uma revisao ultrapassada', async () => {
    const id = randomUUID();
    await drafts.salvar(id, body(), actor);
    const [update, final] = await Promise.allSettled([drafts.salvar(id, body('Outra aba', 1), actor), complete.create(command(id, 1), actor)]);
    const row = await drafts.carregar(id, actor);
    if (final.status === 'fulfilled') {
      assert.equal(update.status, 'rejected');
      assert.equal(row.estado, 'convertido');
      assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 1);
    } else {
      assert.ok(status(final.reason, 409));
      assert.equal(update.status, 'fulfilled');
      assert.equal(row.estado, 'rascunho');
      assert.equal(row.revisao, 2);
      assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 0);
    }
  });

  it('cliente anterior sem rascunho segue valido e duas confirmacoes retornam a mesma entrada', async () => {
    const id = randomUUID();
    const saved = await Promise.all([complete.create(command(id), actor), complete.create(command(id), actor)]);
    assert.equal(String(saved[0].recebimento._id), String(saved[1].recebimento._id));
    assert.equal((await drafts.carregar(id, actor)).estado, 'convertido');
    await assert.rejects(drafts.salvar(id, body(), actor), (error) => status(error, 409));
  });

  it('retoma recebimento anterior a este recurso sem criar outra entrada ou manter dados duplicados', async () => {
    const id = randomUUID();
    const receipt = await db.model(RecebimentoEquipamento.name).create({ ...command(id).recebimento, operacaoId: id, estadoSalvamento: 'confirmado' });
    const existing = await drafts.carregar(id, actor);
    assert.equal(existing.estado, 'convertido');
    assert.equal(existing.recebimentoId, String(receipt._id));
    assert.equal(existing.dados, null);
    await assert.rejects(drafts.salvar(id, body(), actor), (error) => status(error, 409));
    assert.equal((await drafts.carregar(id, actor)).recebimentoId, String(receipt._id));
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: id }), 1);
  });
});
