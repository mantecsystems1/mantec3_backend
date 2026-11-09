import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import mongoose, { Connection, Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { RecebimentoEquipamentoController } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.controller';
import { RecebimentoEquipamentoService } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.service';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema, type RecebimentoEquipamentoDocument } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { CondicoesEquipamento, CondicoesEquipamentoSchema } from '../src/recebimento/condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesSchema } from '../src/recebimento/componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoSchema, type MidiasRecebimentoDocument } from '../src/recebimento/midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoSchema } from '../src/recebimento/termos/termos-recebimento.schema';
import { LogEvento, LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { RecebimentoCompletoService } from '../src/recebimento/recebimento-equipamento/recebimento-completo.service';
import { MidiasRecebimentoService } from '../src/recebimento/midias/midias-recebimento.service';
import { CreateRecebimentoCompletoDto } from '../src/recebimento/recebimento-equipamento/dto/create-recebimento-completo.dto';
import type { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';

describe('Entrada composta atomica e recuperavel — Mongo descartavel', () => {
  let server: MongoMemoryReplSet;
  let db: Connection;
  let service: RecebimentoCompletoService;
  let mediaService: MidiasRecebimentoService;
  let app: INestApplication;
  const empresaId = String(new Types.ObjectId());
  const actorId = String(new Types.ObjectId());
  const clienteId = String(new Types.ObjectId());
  const actor = { id: actorId, empresaId } as CurrentUserPayload;
  const make = (): CreateRecebimentoCompletoDto => ({
    operacaoId: randomUUID(), recebimento: { empresaId, clienteId, recebidoPor: actorId, marca: 'Teste', modelo: 'Celular', tipoEquipamento: 'Celular', status: 'recebido', dataRecebimento: new Date('2026-11-06T12:00:00Z') },
    condicoes: [{ categoria: 'Tela', tipo: 'Risco', severidade: 'baixa' }],
    componentesAusentes: [{ nomeComponente: 'Capa' }], termo: { texto: 'Termo QA', assinado: false },
  });
  before(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    db.model('Cliente', new Schema({ empresaId: Schema.Types.ObjectId }));
    for (const [name, schema] of [
      [RecebimentoEquipamento.name, RecebimentoEquipamentoSchema], [CondicoesEquipamento.name, CondicoesEquipamentoSchema],
      [ComponentesAusentes.name, ComponentesAusentesSchema], [MidiasRecebimento.name, MidiasRecebimentoSchema],
      [TermosRecebimento.name, TermosRecebimentoSchema], [LogEvento.name, LogEventoSchema],
    ] as const) { await db.model(name, schema).init(); }
    await db.model('Cliente').create({ _id: clienteId, empresaId });
    service = new RecebimentoCompletoService(db.model<RecebimentoEquipamentoDocument>(RecebimentoEquipamento.name));
    mediaService = new MidiasRecebimentoService(db.model<MidiasRecebimentoDocument>(MidiasRecebimento.name), db.model<RecebimentoEquipamentoDocument>(RecebimentoEquipamento.name));
    const module = await Test.createTestingModule({ controllers: [RecebimentoEquipamentoController], providers: [
      { provide: RecebimentoEquipamentoService, useValue: {} }, { provide: RecebimentoCompletoService, useValue: service },
    ] }).compile();
    app = module.createNestApplication();
    // Authentication fixture only; the real event PermissionGuard and DTO validation run below.
    app.use((req: { headers: Record<string, string>; user?: object }, _res: unknown, next: () => void) => {
      if (req.headers['x-test-profile']) req.user = { ...actor, perfil: req.headers['x-test-profile'], perfis: req.headers['x-test-extra-profile'] ? [req.headers['x-test-extra-profile']] : [] };
      next();
    });
    app.useGlobalGuards(new PermissionGuard(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  after(async () => { await app?.close(); await db?.close(); await server?.stop(); });

  it('grava cabecalho, condicoes, faltantes, termo e auditoria juntos e replay nao duplica', async () => {
    const dto = make();
    const first = await service.create(dto, actor);
    const replay = await service.create(dto, actor);
    assert.equal(String(first.recebimento._id), String(replay.recebimento._id));
    assert.equal(first.recebimento.estadoSalvamento, 'confirmado');
    assert.equal(first.condicoes.length, 1);
    assert.equal(first.componentesAusentes.length, 1);
    assert.equal(first.termo?.termoHashSha256, createHash('sha256').update('Termo QA').digest('hex'));
    assert.equal(await db.model(LogEvento.name).countDocuments({ entidadeId: first.recebimento._id }), 2);
    assert.equal('operacaoHash' in first.recebimento, false);
  });
  it('mesma chave com conteudo diferente gera conflito sem sobrescrever', async () => {
    const dto = make();
    await service.create(dto, actor);
    await assert.rejects(service.create({ ...dto, recebimento: { ...dto.recebimento, modelo: 'Outro' } }, actor), /outros dados/);
  });
  it('duas requisicoes concorrentes com mesma chave produzem uma entrada', async () => {
    const dto = make();
    const saved = await Promise.all([service.create(dto, actor), service.create(dto, actor)]);
    assert.equal(String(saved[0].recebimento._id), String(saved[1].recebimento._id));
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: dto.operacaoId }), 1);
  });
  it('falha em componente desfaz cabecalho e demais registros', async () => {
    const dto = make();
    dto.componentesAusentes = [{ nomeComponente: '' }];
    const before = await db.model(CondicoesEquipamento.name).countDocuments();
    await assert.rejects(service.create(dto, actor));
    assert.equal(await db.model(RecebimentoEquipamento.name).countDocuments({ operacaoId: dto.operacaoId }), 0);
    assert.equal(await db.model(CondicoesEquipamento.name).countDocuments(), before);
  });
  it('nega cliente/consulta de outra empresa e limita retomadas ao operador', async () => {
    const outsider = { id: actorId, empresaId: String(new Types.ObjectId()) } as CurrentUserPayload;
    const dto = make();
    await assert.rejects(service.create({ ...dto, recebimento: { ...dto.recebimento, empresaId: outsider.empresaId! } }, outsider), /Cliente nao encontrado/);
    const first = await service.create(dto, actor);
    await assert.rejects(service.get(String(first.recebimento._id), outsider.empresaId), /nao encontrada/);
    await assert.rejects(service.porOperacao(dto.operacaoId, { ...actor, id: String(new Types.ObjectId()) }), /ainda nao salva/);
    assert.equal(String((await service.porOperacao(dto.operacaoId, actor)).recebimento._id), String(first.recebimento._id));
  });
  it('mantem anexos pendentes, valida hash e confirma exatamente uma vez', async () => {
    const dto = make();
    const expected = { chaveCliente: randomUUID(), nomeOriginal: 'foto.png', hashSha256: 'a'.repeat(64), tipo: 'foto' };
    dto.midiasEsperadas = [expected];
    const draft = await service.create(dto, actor);
    const id = String(draft.recebimento._id);
    assert.equal(draft.recebimento.estadoSalvamento, 'pendente_midias');
    await assert.rejects(service.confirmar(id, actor), /anexos pendentes/);
    assert.equal((await service.pendentes(actor)).some((item) => String(item._id) === id), true);
    const media = { recebimentoEquipamentoId: id, chaveCliente: expected.chaveCliente, tipo: 'foto', urlArquivo: '/uploads/recebimentos/qa.png', hashSha256: expected.hashSha256 };
    await assert.rejects(mediaService.create(media, empresaId), /Envie o arquivo/);
    await assert.rejects(mediaService.create({ ...media, hashSha256: 'b'.repeat(64) }, empresaId, true), /nao corresponde/);
    const [first, second] = await Promise.all([mediaService.create(media, empresaId, true), mediaService.create(media, empresaId, true)]);
    assert.equal(String(first._id), String(second._id));
    assert.equal((await service.get(id, empresaId)).pendenciasMidias.length, 0);
    await service.confirmar(id, actor);
    await service.confirmar(id, actor);
    assert.equal((await service.get(id, empresaId)).recebimento.estadoSalvamento, 'confirmado');
    assert.equal(await db.model(LogEvento.name).countDocuments({ entidadeId: id }), 3);
    await assert.rejects(mediaService.remove(String(first._id), empresaId), /evidencia original/);
  });
  it('validacao recusa ids/manifesto invalido e campo interno extra nao e contrato', async () => {
    const dto = plainToInstance(CreateRecebimentoCompletoDto, { ...make(), operacaoId: 'id-invalido', midiasEsperadas: [{ chaveCliente: randomUUID(), nomeOriginal: 'foto', hashSha256: 'invalid', tipo: 'foto' }] });
    assert.ok((await validate(dto, { whitelist: true })).length >= 2);
  });
  it('HTTP aplica validacao e guarda real de eventos antes de gravar; operador retoma por chave', async () => {
    const payload = make();
    await request(app.getHttpServer()).post('/recebimento-equipamento/completo').send(payload).expect(401);
    await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'tecnico').send(payload).expect(403);
    await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'recebimento').send({ ...payload, operacaoId: 'incorreta' }).expect(400);
    const first = await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'recebimento').send(payload).expect(201);
    const replay = await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'recebimento').send(payload).expect(201);
    assert.equal(first.body.recebimento._id, replay.body.recebimento._id);
    const restored = await request(app.getHttpServer()).get(`/recebimento-equipamento/completo/operacoes/${payload.operacaoId}`).set('x-test-profile', 'recebimento').expect(200);
    assert.equal(restored.body.recebimento._id, first.body.recebimento._id);
    await request(app.getHttpServer()).post('/recebimento-equipamento/completo').set('x-test-profile', 'tecnico').set('x-test-extra-profile', 'recebimento').send(make()).expect(201);
  });
});
