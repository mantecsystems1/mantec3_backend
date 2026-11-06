import type { Model } from 'mongoose';
import { FiscalSimulationService } from './fiscal-simulation.service';
import { FiscalSimulation } from './fiscal-simulation.schema';
import { FiscalBinding } from './fiscal-binding.schema';
import { Empresa } from '../../core/empresa/schemas/empresa.schema';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { companyPendingItems, hasCurrentFiscalProfile, sameFiscalIdentity, validCnpj } from './fiscal-pending';

const companyFixture = (): Empresa => ({
  nomeFantasia: 'Empresa fictícia', razaoSocial: 'EMPRESA FICTICIA LTDA', cnpj: '11.222.333/0001-81',
  email: 'teste@example.invalid', telefone: '16999999999',
  endereco: { logradouro: 'Rua de teste', numero: '1', bairro: 'Centro', cidade: 'Matão', estado: 'SP', cep: '15990000' },
} as Empresa);
const profileFixture = () => ({ version: 1, validFrom: '2000-01-01', regime: 'mei', municipalityCode: '3529302' });

describe('company-scoped fiscal pending notices', () => {
  const savedEnv = { ...process.env };
  const emitterId = '12345678-1234-4234-8234-123456789abc';
  const manager = { id: 'manager-a', empresaId: 'company-a', perfil: 'admin_empresa' } as CurrentUserPayload;
  let service: FiscalSimulationService;
  let company: Empresa | null;
  let binding: { empresaId: string; emitterId: string } | null;
  let companyLookup: jest.Mock;
  let bindingLookup: jest.Mock;
  let responses: Record<string, Record<string, unknown> | Error>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    Object.assign(process.env, { FISCAL_SIMULATION_ENABLED: 'true', FISCAL_API_URL: 'http://127.0.0.1:3100',
      FISCAL_API_KEY: 'synthetic-service-key', FISCAL_SIMULATION_EMITTERS_JSON: '{}' });
    delete process.env.FISCAL_API_KEY_FILE;
    company = companyFixture();
    binding = { empresaId: manager.empresaId!, emitterId };
    companyLookup = jest.fn((filter: { _id: string }) => ({ select: () => ({ lean: () => ({ exec: async () =>
      filter._id === manager.empresaId ? company : { ...companyFixture(), razaoSocial: 'OUTRA EMPRESA' },
    }) }) }));
    bindingLookup = jest.fn((filter: { empresaId: string }) => ({ lean: () => ({ exec: async () =>
      binding?.empresaId === filter.empresaId ? binding : null,
    }) }));
    service = new FiscalSimulationService({} as Model<FiscalSimulation>,
      { findOne: bindingLookup } as unknown as Model<FiscalBinding>, undefined,
      { findOne: companyLookup } as unknown as Model<Empresa>);
    responses = {
      emitter: { id: emitterId, cnpj: '11222333000181', legalName: 'EMPRESA FICTICIA LTDA', city: 'Matão', state: 'SP',
        revision: 2, fiscalReadiness: 'simulation_only', officialRegistrationVerified: false },
      profiles: { revision: 2, items: [profileFixture()] },
      certificate: { revision: 2, state: 'valid', daysRemaining: 200, officialReady: false,
        current: { validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z' } },
    };
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const path = new URL(String(url)).pathname;
      const key = path.endsWith('/fiscal-profiles') ? 'profiles' : path.endsWith('/certificate-status') ? 'certificate' : 'emitter';
      const response = responses[key];
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify(response));
    });
  });
  afterEach(() => { process.env = { ...savedEnv }; jest.useRealTimers(); jest.restoreAllMocks(); });

  it.each([undefined, { id: 'a' }, { empresaId: 'company-a' }])('requires authenticated user and company before reads: %j', async actor => {
    await expect(service.pendingStatus(actor as unknown as CurrentUserPayload)).rejects.toThrow('Usuario/empresa');
    expect(companyLookup).not.toHaveBeenCalled(); expect(bindingLookup).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['tecnico', 'gerente', 'fiscal', 'atendente'])('does not disclose management notices to %s', async perfil => {
    await expect(service.pendingStatus({ ...manager, perfil })).rejects.toThrow('Somente administrador');
    expect(companyLookup).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['admin_empresa', 'admin', 'administrador'])('reports clear without certifying official regularity for %s', async perfil => {
    const result = await service.pendingStatus({ ...manager, perfil });
    expect(result).toEqual({ state: 'clear', pendingCount: 0, items: [], checkedAt: expect.any(String), officialRegistrationVerified: false });
    expect(Date.parse(result.checkedAt)).not.toBeNaN();
    expect(companyLookup).toHaveBeenCalledWith({ _id: manager.empresaId });
    expect(bindingLookup).toHaveBeenCalledWith({ empresaId: manager.empresaId });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes(`/v1/emitters/${emitterId}`))).toBe(true);
  });
  it('does not read the original company or call its emitter when another company is in the session', async () => {
    const result = await service.pendingStatus({ ...manager, empresaId: 'company-b' });
    expect(result.items.map(item => item.code)).toEqual(['FISCAL_EMITTER_UNBOUND']);
    expect(companyLookup).toHaveBeenCalledTimes(1); expect(companyLookup).toHaveBeenCalledWith({ _id: 'company-b' });
    expect(bindingLookup).toHaveBeenCalledTimes(1); expect(bindingLookup).toHaveBeenCalledWith({ empresaId: 'company-b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports incomplete saved data and invalid CNPJ independently', async () => {
    company!.email = '  '; company!.cnpj = '12345678000199';
    const result = await service.pendingStatus(manager);
    expect(result.state).toBe('pending');
    expect(result.items.map(item => item.code)).toEqual(expect.arrayContaining(['COMPANY_INCOMPLETE', 'COMPANY_CNPJ_INVALID']));
    expect(result.pendingCount).toBe(result.items.length);
  });
  it('reports a missing local company without looking up or creating fiscal records', async () => {
    company = null;
    const result = await service.pendingStatus(manager);
    expect(result.items.map(item => item.code)).toEqual(['COMPANY_MISSING']);
    expect(bindingLookup).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('distinguishes a confirmed missing binding from unavailable configuration', async () => {
    binding = null;
    await expect(service.pendingStatus(manager)).resolves.toMatchObject({ state: 'pending', pendingCount: 1,
      items: [{ code: 'FISCAL_EMITTER_UNBOUND' }] });
    process.env.FISCAL_API_URL = 'invalid-url';
    await expect(service.pendingStatus(manager)).resolves.toMatchObject({ state: 'unavailable', pendingCount: 0, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not invent missing profiles or A1 when all remote consultations fail', async () => {
    responses.emitter = responses.profiles = responses.certificate = new Error('synthetic upstream failure');
    await expect(service.pendingStatus(manager)).resolves.toMatchObject({ state: 'unavailable', pendingCount: 0, items: [] });
  });
  it('preserves local confirmed problems during remote failure', async () => {
    company!.cnpj = '12345678000199';
    responses.emitter = responses.profiles = responses.certificate = new Error('synthetic upstream failure');
    const result = await service.pendingStatus(manager);
    expect(result).toMatchObject({ state: 'unavailable', pendingCount: 1 });
    expect(result.items.map(item => item.code)).toEqual(['COMPANY_CNPJ_INVALID']);
  });
  it('preserves confirmed remote items when a different consultation fails', async () => {
    responses.profiles = { revision: 2, items: [] };
    responses.certificate = new Error('temporarily unavailable');
    const result = await service.pendingStatus(manager);
    expect(result.state).toBe('unavailable');
    expect(result.items.map(item => item.code)).toEqual(['FISCAL_PROFILE_MISSING']);
  });
  it.each([{ cnpj: '11444777000161' }, { legalName: 'OUTRA EMPRESA' }, { city: 'Outra cidade' }, { state: 'RJ' }])(
    'reports a saved/remote identity mismatch: %j', async change => {
      responses.emitter = { ...responses.emitter, ...change };
      const result = await service.pendingStatus(manager);
      expect(result.items.map(item => item.code)).toEqual(['FISCAL_IDENTITY_MISMATCH']);
      expect(result.items[0].severity).toBe('error');
    });
  it('uses the Brasília day when deciding whether a profile is already effective', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-05T02:59:59Z'));
    responses.profiles = { revision: 2, items: [{ ...profileFixture(), validFrom: '2026-11-05' }] };
    let result = await service.pendingStatus(manager);
    expect(result.items.map(item => item.code)).toEqual(['FISCAL_PROFILE_MISSING']);
    jest.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    result = await service.pendingStatus(manager);
    expect(result.state).toBe('clear');
  });
  it.each(['missing', 'disabled', 'expired', 'not_yet_valid', 'expiring'])('reports verified A1 state %s', async state => {
    responses.certificate = state === 'missing'
      ? { revision: 2, state, daysRemaining: null, current: null, officialReady: false }
      : { ...responses.certificate, state };
    const result = await service.pendingStatus(manager);
    expect(result.state).toBe('pending'); expect(result.pendingCount).toBe(1);
    expect(result.items[0]).toMatchObject({ code: `CERTIFICATE_${state.toUpperCase()}`, target: '/minha-empresa',
      severity: ['expired', 'disabled'].includes(state) ? 'error' : 'warning' });
  });
  it.each([
    { certificate: { revision: 2, state: 'missing', current: null, daysRemaining: 3, officialReady: false } },
    { certificate: { revision: 2, state: 'valid', current: { validFrom: 'bad-date', validTo: 'bad-date' }, daysRemaining: 3, officialReady: false } },
    { certificate: { revision: 2, state: 'valid', current: {}, daysRemaining: 3, officialReady: true } },
    { profiles: { revision: 2, items: [{ ...profileFixture(), validFrom: '2026-02-30' }] } },
    { profiles: { revision: 2, items: [{ ...profileFixture(), regime: 'unknown' }] } },
    { emitter: { revision: 2, id: 'foreign-emitter', fiscalReadiness: 'simulation_only' } },
  ])('treats malformed metadata as unavailable rather than a missing item: %j', async overrides => {
    Object.assign(responses, overrides);
    const result = await service.pendingStatus(manager);
    expect(result).toMatchObject({ state: 'unavailable', pendingCount: 0, items: [] });
  });
  it('does not combine remote data from different revisions into actionable notices', async () => {
    company!.email = '';
    responses.profiles = { revision: 3, items: [] };
    responses.certificate = { revision: 2, state: 'missing', current: null, daysRemaining: null, officialReady: false };
    const result = await service.pendingStatus(manager);
    expect(result.state).toBe('unavailable');
    expect(result.items.map(item => item.code)).toEqual(['COMPANY_INCOMPLETE']);
  });
  it('does not send tenant records, credentials, certificate material or raw upstream text in notices', async () => {
    responses.emitter = { ...responses.emitter, cnpj: '11444777000161', password: 'upstream-private-marker', body: 'raw-private-marker' };
    responses.certificate = { revision: 2, state: 'missing', current: null, daysRemaining: null, officialReady: false,
      pfxBase64: 'pfx-private-marker', history: ['history-private-marker'] };
    const result = await service.pendingStatus(manager);
    expect(result.pendingCount).toBe(2);
    expect(Object.keys(result).sort()).toEqual(['checkedAt', 'items', 'officialRegistrationVerified', 'pendingCount', 'state']);
    for (const item of result.items) expect(Object.keys(item).sort()).toEqual(['code', 'description', 'severity', 'target', 'title']);
    const serialized = JSON.stringify(result);
    for (const secret of ['private-marker', emitterId, manager.empresaId, manager.id, 'synthetic-service-key',
      '11222333000181', '11444777000161', company!.razaoSocial]) expect(serialized).not.toContain(secret);
  });
});

describe('fiscal notice calendar and local identity checks', () => {
  it.each(['11222333000181', '11444777000161'])('accepts numeric CNPJ with both valid check digits: %s', cnpj => {
    expect(validCnpj(cnpj)).toBe(true);
  });
  it.each(['', '12345678000199', '11111111111111', '11222333000180', '11222333000171', '11.222.333/0001-81'])('rejects malformed CNPJ: %s', cnpj => {
    expect(validCnpj(cnpj)).toBe(false);
  });
  it('normalizes formatting and NFC/city case without silently changing legal identity', () => {
    const company = companyFixture();
    company.razaoSocial = ' Razão Social '; company.endereco.cidade = ' Matão '; company.endereco.estado = ' sp ';
    const emitter = { cnpj: '11222333000181', legalName: 'Razão Social'.normalize('NFD'), city: 'MATÃO', state: 'SP' };
    expect(sameFiscalIdentity(company, emitter)).toBe(true);
    expect(sameFiscalIdentity(company, { ...emitter, legalName: 'Outra razão social' })).toBe(false);
  });
  it('does not require logo, complement or a municipal registration to consider saved company data complete', () => {
    expect(companyPendingItems(companyFixture())).toEqual([]);
  });
  it('accepts CNPJ punctuation and whitespace while rejecting embedded letters', () => {
    const company = companyFixture(); company.cnpj = ' 11.222.333/0001-81 ';
    expect(companyPendingItems(company)).toEqual([]);
    company.cnpj = 'ABC11222333000181';
    expect(companyPendingItems(company).map(item => item.code)).toEqual(['COMPANY_CNPJ_INVALID']);
  });
  it.each(['sem-arroba', 'contato@', 'contato@dominio-invalido'])('reports a nonempty invalid email address: %s', email => {
    const company = companyFixture(); company.email = email;
    expect(companyPendingItems(company).map(item => item.code)).toEqual(['COMPANY_EMAIL_INVALID']);
  });
  it('reports invalid UF and whitespace-only address fields', () => {
    const company = companyFixture(); company.endereco.estado = 'ZZ'; company.endereco.numero = '  ';
    expect(companyPendingItems(company).map(item => item.code)).toEqual(['COMPANY_INCOMPLETE', 'COMPANY_STATE_INVALID']);
  });
  it.each([
    ['2026-11-04', false], ['2026-11-05', true], ['2026-11-09', true], ['2026-11-10', false], ['2026-11-11', false],
  ])('uses inclusive start/exclusive end for calendar day %s', (today, expected) => {
    expect(hasCurrentFiscalProfile({ revision: 1, items: [{ ...profileFixture(), validFrom: '2026-11-05',
      validUntilExclusive: '2026-11-10' }] }, today)).toBe(expected);
  });
  it('does not accept only historical or future profiles as current', () => {
    expect(hasCurrentFiscalProfile({ revision: 2, items: [
      { ...profileFixture(), validFrom: '2025-01-01', validUntilExclusive: '2026-01-01' },
      { ...profileFixture(), version: 2, validFrom: '2027-01-01' },
    ] }, '2026-11-05')).toBe(false);
  });
  it('rejects overlapping effective profiles rather than silently choosing one', () => {
    expect(() => hasCurrentFiscalProfile({ revision: 2, items: [profileFixture(), { ...profileFixture(), version: 2 }] }, '2026-11-05'))
      .toThrow('Ambiguous profile');
  });
});
