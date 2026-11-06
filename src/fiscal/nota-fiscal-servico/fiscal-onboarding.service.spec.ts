import { Model } from 'mongoose';
import { FiscalSimulationService } from './fiscal-simulation.service';
import { FiscalSimulation } from './fiscal-simulation.schema';
import { FiscalBinding } from './fiscal-binding.schema';
import { FiscalRegistration } from './fiscal-registration.schema';
import { Empresa } from '../../core/empresa/schemas/empresa.schema';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

describe('company-owned fiscal onboarding', () => {
  const savedEnv = { ...process.env };
  const emitter = '12345678-1234-4234-8234-123456789abc';
  const owner = { id: 'manager-a', empresaId: 'a', perfil: 'admin_empresa' } as CurrentUserPayload;
  const input = { cnpj: '11222333000181', legalName: 'EMPRESA FICTICIA', city: 'Matão', state: 'SP' };
  let service: FiscalSimulationService;
  let registrations: Map<string, Record<string, unknown>>;
  let bindings: Map<string, Record<string, unknown>>;
  let companyLookup: jest.Mock;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    Object.assign(process.env, { FISCAL_SIMULATION_ENABLED: 'true', FISCAL_API_URL: 'http://127.0.0.1:3100',
      FISCAL_API_KEY: 'synthetic-key', FISCAL_SIMULATION_EMITTERS_JSON: '{}' });
    delete process.env.FISCAL_API_KEY_FILE;
    registrations = new Map(); bindings = new Map();
    const query = (read: () => unknown) => ({ exec: async () => read(), lean: () => ({ exec: async () => read() }) });
    const registrationModel = {
      findOne: (filter: { empresaId: string }) => query(() => registrations.get(filter.empresaId) ?? null),
      exists: async (filter: { empresaId: string }) => registrations.has(filter.empresaId),
      findOneAndUpdate: (filter: { empresaId: string }, update: { $setOnInsert: Record<string, unknown> }) => query(() => {
        if (!registrations.has(filter.empresaId)) registrations.set(filter.empresaId, { _id: filter.empresaId, ...update.$setOnInsert });
        return registrations.get(filter.empresaId);
      }),
      updateOne: (filter: { empresaId: string }, update: { $set: Record<string, unknown> }) => query(() => Object.assign(registrations.get(filter.empresaId)!, update.$set)),
    };
    const bindingModel = {
      findOne: (filter: { empresaId: string }) => query(() => bindings.get(filter.empresaId) ?? null),
      findOneAndUpdate: (filter: { empresaId: string }, update: { $setOnInsert: Record<string, unknown> }) => query(() => {
        if ([...bindings.values()].some(b => b.emitterId === update.$setOnInsert.emitterId && b.empresaId !== filter.empresaId)) throw Object.assign(new Error(), { code: 11000 });
        if (!bindings.has(filter.empresaId)) bindings.set(filter.empresaId, update.$setOnInsert);
        return bindings.get(filter.empresaId);
      }),
    };
    companyLookup = jest.fn((filter: { _id: string }) => ({ select: () => query(() => filter._id === 'a'
      ? { cnpj: '11.222.333/0001-81', razaoSocial: input.legalName, endereco: { cidade: input.city, estado: 'SP' } }
      : { cnpj: '11444777000161', razaoSocial: 'OUTRA EMPRESA', endereco: { cidade: 'Outra cidade', estado: 'SP' } }) }));
    service = new FiscalSimulationService({ findOne: () => query(() => null) } as unknown as Model<FiscalSimulation>,
      bindingModel as unknown as Model<FiscalBinding>, registrationModel as unknown as Model<FiscalRegistration>,
      { findOne: companyLookup } as unknown as Model<Empresa>);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => new Response(JSON.stringify({
      id: emitter, fiscalReadiness: 'simulation_only', ...(String(url).endsWith('/ensure') ? JSON.parse(options!.body as string) : {}),
    })));
  });
  afterEach(() => { process.env = { ...savedEnv }; jest.restoreAllMocks(); });

  it('lets admin_empresa create and bind its own saved identity, with idempotent recovery', async () => {
    await expect(service.registerEmitter(input, owner)).resolves.toMatchObject({ configured: true });
    await service.registerEmitter(input, owner);
    expect(companyLookup).toHaveBeenCalledWith({ _id: 'a' });
    expect(bindings.get('a')).toMatchObject({ empresaId: 'a', emitterId: emitter, createdBy: owner.id });
    expect(registrations.size).toBe(1);
    await expect(service.registrationStatus(owner)).resolves.toMatchObject({ completed: true, pending: false, payload: input });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/ensure'))).toHaveLength(1);
  });
  it.each([{ cnpj: '11444777000161' }, { legalName: 'OUTRA EMPRESA' }, { city: 'Outra cidade' }, { state: 'RJ' }])(
    'rejects client identity different from the saved company: %j', async change => {
      await expect(service.registerEmitter({ ...input, ...change }, owner)).rejects.toThrow('dados salvos');
      expect(registrations.size).toBe(0); expect(fetchMock).not.toHaveBeenCalled();
    });
  it('does not let a different company claim the same submitted company identity', async () => {
    await expect(service.registerEmitter(input, { ...owner, empresaId: 'b' })).rejects.toThrow('dados salvos');
    expect(companyLookup).toHaveBeenCalledWith({ _id: 'b' }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('scopes pending/status records to the company in the session', async () => {
    await service.registerEmitter(input, owner);
    await expect(service.registrationStatus({ ...owner, empresaId: 'b' })).resolves.toEqual({
      pending: false, payload: null, completed: false, fiscalValidity: false,
    });
  });
  it('keeps arbitrary UUID binding reserved to master and blocks staff onboarding', async () => {
    await expect(service.bindEmitter(emitter, owner)).rejects.toThrow('Somente administrador');
    await expect(service.registerEmitter(input, { ...owner, perfil: 'tecnico' })).rejects.toThrow('Somente administrador');
    await expect(service.registrationStatus({ ...owner, perfil: 'tecnico' })).rejects.toThrow('Somente administrador');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cannot replace a preexisting binding after creating an own-company emitent', async () => {
    bindings.set('b', { empresaId: 'b', emitterId: emitter });
    await expect(service.registerEmitter(input, owner)).rejects.toThrow('ja vinculado');
    expect(bindings.has('a')).toBe(false); expect(bindings.get('b')?.emitterId).toBe(emitter);
  });
  it('preserves the existing fiscal identity when general company details are changed later', async () => {
    await service.registerEmitter(input, owner);
    const changed = { ...input, cnpj: '11444777000161' };
    companyLookup.mockImplementation(() => ({ select: () => ({ lean: () => ({ exec: async () => ({
      cnpj: changed.cnpj, razaoSocial: changed.legalName, endereco: { cidade: changed.city, estado: changed.state },
    }) }) }) }));
    fetchMock.mockClear();
    await expect(service.registerEmitter(changed, owner)).rejects.toThrow('dados diferentes');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(registrations.get('a')?.payload).toEqual(input);
    expect(bindings.get('a')?.emitterId).toBe(emitter);
  });
});
