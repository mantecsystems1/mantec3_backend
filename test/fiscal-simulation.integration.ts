import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createConnection, Types } from 'mongoose';
import { Empresa, EmpresaSchema } from '../src/core/empresa/schemas/empresa.schema';
import { FiscalSimulation, FiscalSimulationSchema } from '../src/fiscal/nota-fiscal-servico/fiscal-simulation.schema';
import { FiscalSimulationService } from '../src/fiscal/nota-fiscal-servico/fiscal-simulation.service';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FiscalSimulationController } from '../src/fiscal/nota-fiscal-servico/fiscal-simulation.controller';
import { AuthTokenGuard } from '../src/common/guards/auth-token.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { FiscalBinding, FiscalBindingSchema } from '../src/fiscal/nota-fiscal-servico/fiscal-binding.schema';
import { FiscalRegistration, FiscalRegistrationSchema } from '../src/fiscal/nota-fiscal-servico/fiscal-registration.schema';
import type { CurrentUserPayload } from '../src/common/decorators/current-user.decorator';

async function main() {
  // Explicit local fiscal environment, never the ERP database.
  const envFile = process.argv[2];
  if (!envFile) throw new Error('Informe o arquivo .env da API fiscal LOCAL.');
  loadEnvFile(envFile);
  const uri = new URL(process.env.MONGODB_URI!);
  if (uri.hostname !== '127.0.0.1' || uri.port !== '27117') throw new Error('Somente Mongo fiscal local permitido.');
  const database = `fiscal_bridge_test_${randomUUID().replaceAll('-', '')}`;
  uri.pathname = `/${database}`;
  const key = process.env.LOCAL_API_KEY!;
  async function call(path: string) {
    const response = await fetch(`http://127.0.0.1:3100${path}`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`API local: HTTP ${response.status}`);
    return response.json();
  }
  const list = await call('/v1/emitters');
  const emitter = list.items.find((item: { cnpj: string }) => item.cnpj === '11222333000181');
  if (!emitter) throw new Error('Execute smoke:local da API fiscal para preparar emitente ficticio.');
  const empresaId = '000000000000000000000001';
  process.env.FISCAL_SIMULATION_ENABLED = 'true'; process.env.FISCAL_API_URL = 'http://127.0.0.1:3100';
  process.env.FISCAL_API_KEY = key;
  process.env.FISCAL_SIMULATION_EMITTERS_JSON = JSON.stringify({ [empresaId]: emitter.id, foreign: emitter.id });
  const connection = await createConnection(uri.toString()).asPromise();
  try {
    const model = connection.model(FiscalSimulation.name, FiscalSimulationSchema);
    const bindings = connection.model(FiscalBinding.name, FiscalBindingSchema);
    const registrations = connection.model(FiscalRegistration.name, FiscalRegistrationSchema);
    const companies = connection.model(Empresa.name, EmpresaSchema);
    await registrations.init();
    await bindings.init();
    await model.init();
    const service = new FiscalSimulationService(model);
    const requestId = randomUUID();
    await Promise.all(Array.from({ length: 5 }, () => service.submit(requestId, empresaId)));
    assert.equal(await model.countDocuments(), 1);
    const stored = await model.findOne({ empresaId, requestId }).orFail();
    const firstId = stored.documentId;
    let result = await service.get(requestId, empresaId);
    for (let i = 0; i < 50 && result.status !== 'simulated_authorized'; i++) {
      await new Promise(resolve => setTimeout(resolve, 200)); result = await service.get(requestId, empresaId);
    }
    assert.equal(result.status, 'simulated_authorized'); assert.equal(result.fiscalValidity, false);
    const receipt = await service.receipt(requestId, empresaId);
    assert.equal(JSON.parse(receipt.content).fiscalValidity, false);
    assert.equal(JSON.parse(receipt.content).documentId, firstId);
    assert.equal((await service.history(empresaId)).items[0].receiptAvailable, true);
    assert.equal((await service.history('foreign')).items.length, 0);
    await assert.rejects(service.receipt(requestId, 'foreign'), /nao encontrada/);
    await new FiscalSimulationService(model).submit(requestId, empresaId);
    assert.deepEqual(await service.receipt(requestId, empresaId), receipt);
    assert.equal((await model.findOne({ empresaId, requestId }).orFail()).documentId, firstId);
    await assert.rejects(service.get(requestId, 'foreign'), /nao encontrada/);
    // Download remains available without a running upstream or enabled integration.
    process.env.FISCAL_SIMULATION_ENABLED = 'false';
    assert.deepEqual(await service.receipt(requestId, empresaId), receipt);
    const module = await Test.createTestingModule({ controllers: [FiscalSimulationController],
      providers: [{ provide: FiscalSimulationService, useValue: service }] })
      .overrideGuard(AuthTokenGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { user: unknown } } }) => {
        context.switchToHttp().getRequest().user = { empresaId }; return true;
      } }).overrideGuard(PermissionGuard).useValue({ canActivate: () => true }).compile();
    const app = module.createNestApplication({ logger: false });
    await app.init();
    try {
      const downloaded = await request(app.getHttpServer()).get(`/fiscal-simulacoes/${requestId}/comprovante`)
        .expect(200).expect('Cache-Control', 'no-store').expect('X-Content-SHA256', receipt.sha256)
        .expect('Content-Disposition', `attachment; filename="simulacao-${requestId}.json"`);
      assert.equal(downloaded.text, receipt.content);
      await request(app.getHttpServer()).get('/fiscal-simulacoes/not-a-uuid/comprovante').expect(400);
    } finally { await app.close(); }
    const fixtures = Array.from({ length: 22 }, () => ({ empresaId, requestId: randomUUID(), emitterId: emitter.id, competenceDate: '2026-10-21' }));
    await model.insertMany(fixtures);
    const page1 = await service.history(empresaId);
    assert.equal(page1.items.length, 20); assert.ok(page1.nextCursor);
    const page2 = await service.history(empresaId, page1.nextCursor!);
    assert.equal(page2.items.length, 3); assert.equal(page2.nextCursor, null);
    assert.equal(new Set([...page1.items, ...page2.items].map(item => item.requestId)).size, 23);
    await assert.rejects(service.history(empresaId, 'invalid'), /Cursor/);
    await assert.rejects(service.receipt(fixtures[0].requestId, empresaId), /concluido/);
    await model.updateOne({ empresaId, requestId }, { $set: { receiptContent: 'tampered' } });
    await assert.rejects(service.receipt(requestId, empresaId), /Integridade/);
    // Configure a separate fictitious emitter; never mutate the shared smoke profile.
    process.env.FISCAL_SIMULATION_ENABLED = 'true';
    const digits = [...('98' + String(Date.now()).slice(-10))].map(Number);
    for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      const remainder = digits.reduce((sum, digit, i) => sum + digit * weights[i], 0) % 11;
      digits.push(remainder < 2 ? 0 : 11 - remainder);
    }
    const registration = { cnpj: digits.join(''), legalName: 'Emitente ficticio teste configuracao ERP', city: 'Matao', state: 'SP' };
    const master = { id: 'test-master', empresaId: '000000000000000000000002', perfil: 'administrador' } as CurrentUserPayload;
    const manager = { ...master, id: 'test-manager', perfil: 'admin_empresa' };
    await companies.create({ _id: new Types.ObjectId(master.empresaId), cnpj: registration.cnpj, razaoSocial: registration.legalName,
      nomeFantasia: 'Empresa ficticia ERP', email: 'ficticio@example.invalid', telefone: '16000000000',
      endereco: { cidade: registration.city, estado: registration.state, logradouro: 'Rua ficticia', numero: '1', bairro: 'Teste', cep: '00000000' } });
    const configured = new FiscalSimulationService(model, bindings, registrations, companies);
    await assert.rejects(configured.registerEmitter({ ...registration, cnpj: '11222333000181' }, manager), /dados salvos/);
    await assert.rejects(configured.registerEmitter({ ...registration, cnpj: '11111111111111' }, master), /CNPJ invalido/);
    const actualFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        const result = await actualFetch(input, init);
        if (String(input).endsWith('/v1/emitters/ensure')) { await result.text(); throw new Error('Synthetic response loss'); }
        return result;
      };
      await assert.rejects(configured.registerEmitter(registration, manager), /Nao foi possivel/);
    } finally { globalThis.fetch = actualFetch; }
    assert.equal((await configured.registrationStatus(master)).pending, true);
    await assert.rejects(configured.registerEmitter({ ...registration, city: 'Outro municipio' }, master), /dados diferentes/);
    await configured.registerEmitter(registration, manager);
    await new FiscalSimulationService(model, bindings, registrations, companies).registerEmitter(registration, manager);
    assert.equal(await registrations.countDocuments(), 1);
    assert.equal((await configured.registrationStatus(master)).completed, true);
    assert.equal((await configured.registrationStatus(manager)).completed, true);
    assert.equal((await configured.registrationStatus({ ...manager, empresaId: '000000000000000000000004' })).payload, null);
    const newEmitter = { id: (await bindings.findOne({ empresaId: master.empresaId }).orFail()).emitterId };
    await assert.rejects(configured.bindEmitter(newEmitter.id, manager), /Somente administrador/);
    await configured.bindEmitter(newEmitter.id, master);
    await configured.bindEmitter(newEmitter.id, master); // same binding is idempotent
    await assert.rejects(configured.bindEmitter(newEmitter.id, { ...master, empresaId: '000000000000000000000003' }), /vinculado/);
    await assert.rejects(configured.bindEmitter(emitter.id, master), /legado conflitante/);
    assert.equal((await configured.availability(master.empresaId)).enabled, true);
    await assert.rejects(configured.fiscalProfiles({ ...manager, perfil: 'tecnico' }), /Somente administrador/);
    const profile = { expectedRevision: 0, validFrom: '2026-01-01', regime: 'mei', municipalityCode: '3529302', reason: 'Teste de perfil versionado' };
    const firstProfile = await configured.addFiscalProfile(profile, manager);
    assert.equal(firstProfile.items.length, 1);
    await assert.rejects(configured.addFiscalProfile(profile, manager), /Conflito fiscal/);
    const secondProfile = await configured.addFiscalProfile({ ...profile, expectedRevision: 1, validFrom: '2027-01-01', regime: 'simples_nacional' }, manager);
    assert.equal(secondProfile.items.length, 2); assert.equal(secondProfile.items[0].regime, 'mei');
    assert.equal(secondProfile.items[0].validUntilExclusive, '2027-01-01');
    const other = { ...manager, empresaId: '000000000000000000000004' };
    await assert.rejects(configured.fiscalProfiles(other), /nao configurada/);
    const certificate = await configured.certificateStatus(manager);
    assert.equal(certificate.state, 'missing'); assert.equal(certificate.officialReady, false);
    await assert.rejects(configured.certificateStatus(other), /nao configurada/);
    await assert.rejects(configured.certificateStatus({ ...manager, perfil: 'tecnico' }), /Somente administrador/);
    console.log(JSON.stringify({ result: 'ok', concurrentRequests: 5, localRecords: 1, restartReplay: true,
      status: result.status, fiscalValidity: false, foreignCompanyBlocked: true,
      receiptStable: true, offlineDownload: true, tamperRejected: true, historyPagination: true,
      bindingPermissions: true, duplicateBindingRejected: true, versionedProfiles: true,
      emitterRegistrationRecoveredAfterLostResponse: true, certificateMetadataIsolated: true, companyOwnedOnboarding: true }));
  } finally {
    if (connection.name === database && database.startsWith('fiscal_bridge_test_')) await connection.dropDatabase();
    await connection.close();
  }
}
void main().catch(() => { console.error('Teste local da ponte fiscal falhou. Verifique API, worker e emitente ficticio.'); process.exitCode = 1; });
