import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Model } from 'mongoose';
import { FiscalSimulationService } from './fiscal-simulation.service';
import { FiscalSimulation } from './fiscal-simulation.schema';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

describe('ERP fiscal simulation bridge', () => {
  const emitterId = '12345678-1234-4234-8234-123456789abc';
  const requestId = '22345678-1234-4234-8234-123456789abc';
  const documentId = '32345678-1234-4234-8234-123456789abc';
  const savedEnv = { ...process.env };
  let record: Record<string, unknown> | null;
  let service: FiscalSimulationService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const response = (changes = {}) => new Response(JSON.stringify({ id: documentId, emitterId,
    reference: `ERP-SIM-${requestId}`, mode: 'simulado', fiscalValidity: false, status: 'pending', ...changes }));
  beforeEach(() => {
    process.env.FISCAL_SIMULATION_ENABLED = 'true';
    process.env.FISCAL_API_URL = 'http://127.0.0.1:3100';
    process.env.FISCAL_API_KEY = 'synthetic-service-key';
    process.env.FISCAL_SIMULATION_EMITTERS_JSON = JSON.stringify({ a: emitterId, b: emitterId });
    record = null;
    const model = {
      findOneAndUpdate: (filter: Record<string, unknown>, update: { $setOnInsert: Record<string, unknown> }) => ({ exec: async () => {
        record ??= { _id: 'local', ...filter, ...update.$setOnInsert }; return record;
      } }),
      findOne: (filter: Record<string, unknown>) => ({ exec: async () => record?.empresaId === filter.empresaId && record?.requestId === filter.requestId ? record : null }),
      updateOne: (_filter: unknown, update: { $set: Record<string, unknown> }) => ({ exec: async () => Object.assign(record!, update.$set) }),
    };
    service = new FiscalSimulationService(model as unknown as Model<FiscalSimulation>);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => { process.env = { ...savedEnv }; jest.restoreAllMocks(); });

  const manager = { id: 'test-manager', empresaId: 'a', perfil: 'admin_empresa' } as CurrentUserPayload;
  it.each(['valid', 'expiring', 'expired', 'not_yet_valid', 'disabled'])('exposes only certificate dates and status for %s', async state => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ revision: 0, state, daysRemaining: 10, officialReady: false,
      current: { validFrom: '2026-01-01T00:00:00Z', validTo: '2027-01-01T00:00:00Z', privateKey: 'DO_NOT_EXPOSE', subject: 'personal-data' },
      history: ['private-history'], password: 'DO_NOT_EXPOSE' })));
    const result = await service.certificateStatus(manager);
    expect(result).toEqual({ revision: 0, state, daysRemaining: 10, officialReady: false, revocationChecked: false,
      validFrom: '2026-01-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/v1/emitters/${emitterId}/certificate-status`);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
  });
  it('distinguishes missing certificate from unavailable service', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ revision: 0, state: 'missing', current: null, daysRemaining: null, officialReady: false })));
    await expect(service.certificateStatus(manager)).resolves.toMatchObject({ state: 'missing', validTo: null });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(service.certificateStatus(manager)).rejects.toThrow('Nao foi possivel');
  });
  it.each([{ state: 'approved' }, { state: 'valid', current: null }, { state: 'valid', current: { validFrom: 'bad', validTo: 'bad' } },
    { state: 'missing', current: null, daysRemaining: null, officialReady: true }])('rejects malformed certificate metadata %j', async body => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ officialReady: false, daysRemaining: 10, ...body })));
    await expect(service.certificateStatus(manager)).rejects.toThrow();
  });
  it('blocks certificate metadata for unauthorized profiles and unbound companies before remote call', async () => {
    await expect(service.certificateStatus({ ...manager, perfil: 'tecnico' })).rejects.toThrow('Somente administrador');
    await expect(service.certificateStatus({ ...manager, empresaId: 'foreign' })).rejects.toThrow('nao configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([200, 409, 500])('uploads once and clears secrets on upstream status %s', async status => {
    const dto = { expectedRevision: 3, pfxBase64: 'synthetic-pfx', password: 'synthetic-password', reason: 'Renovacao' };
    let sent: Record<string, unknown> = {};
    fetchMock.mockImplementationOnce(async (url, init) => {
      expect(String(url)).toContain('/v1/emitters/' + emitterId + '/certificates');
      sent = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ password: 'UPSTREAM_SECRET' }), { status });
    });
    const result = service.uploadCertificate(dto, manager);
    if (status === 200) await expect(result).resolves.toEqual({ received: true, officialReady: false });
    else await expect(result).rejects.toThrow();
    expect(sent).toMatchObject({ expectedRevision: 3, password: 'synthetic-password', pfxBase64: 'synthetic-pfx' });
    expect(sent.reason).toContain(manager.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dto.password).toBe(''); expect(dto.pfxBase64).toBe('');
  });
  it('clears upload secrets and does not dispatch for an unauthorized user', async () => {
    const dto = { expectedRevision: 0, pfxBase64: 'synthetic-pfx', password: 'secret', reason: 'Cadastro' };
    await expect(service.uploadCertificate(dto, { ...manager, perfil: 'tecnico' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dto.password).toBe(''); expect(dto.pfxBase64).toBe('');
  });

  it('reads the fiscal API credential from a secret file and rejects ambiguous settings', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'erp-fiscal-key-'));
    try {
      const path = join(directory, 'key'); writeFileSync(path, 'synthetic-file-key\n');
      delete process.env.FISCAL_API_KEY; process.env.FISCAL_API_KEY_FILE = path;
      fetchMock.mockResolvedValueOnce(response());
      await service.submit(requestId, 'a');
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'synthetic-file-key' });
      process.env.FISCAL_API_KEY = 'ambiguous'; fetchMock.mockClear();
      await expect(service.submit(requestId, 'a')).rejects.toThrow('nao configurada');
      expect(fetchMock).not.toHaveBeenCalled();
      delete process.env.FISCAL_API_KEY; process.env.FISCAL_API_KEY_FILE = join(directory, 'missing');
      await expect(service.submit(requestId, 'a')).rejects.toThrow('nao configurada');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('persists payload before dispatch and reuses the same key after a lost response', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(response());
    await expect(service.submit(requestId, 'a')).rejects.toThrow('mesma tentativa');
    const date = record!.competenceDate;
    await expect(service.submit(requestId, 'a')).resolves.toMatchObject({ mode: 'simulado', fiscalValidity: false });
    const first = fetchMock.mock.calls[0][1]!, second = fetchMock.mock.calls[1][1]!;
    expect(first.body).toBe(second.body);
    expect(first.headers).toEqual(second.headers);
    expect(record!.competenceDate).toBe(date);
    expect(record!.documentId).toBe(documentId);
    expect(JSON.parse(first.body as string).amount).toBe('1.00');
  });
  it('queries stored document on replay rather than posting another request', async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ status: 'simulated_authorized' }));
    await service.submit(requestId, 'a');
    await expect(service.submit(requestId, 'a')).resolves.toMatchObject({ status: 'simulated_authorized' });
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/v1/documents/${documentId}`);
    expect(fetchMock.mock.calls[1][1]?.method).toBeUndefined();
  });
  it('does not query the remote API for another company document', async () => {
    fetchMock.mockResolvedValueOnce(response()); await service.submit(requestId, 'a'); fetchMock.mockClear();
    await expect(service.get(requestId, 'b')).rejects.toThrow('nao encontrada');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ fiscalValidity: true }, { mode: 'producao' }, { emitterId: documentId }, { reference: 'foreign' }, { status: 'authorized' }])(
    'rejects unexpected remote identity or fiscal validity: %j', async changes => {
      fetchMock.mockResolvedValueOnce(response(changes));
      await expect(service.submit(requestId, 'a')).rejects.toThrow('incompatível');
      expect(record!.documentId).toBeUndefined();
    });
  it('fails closed when disabled, unmapped or missing tenant', async () => {
    await expect(service.submit(requestId)).rejects.toThrow('Empresa');
    await expect(service.submit(requestId, 'unmapped')).rejects.toThrow('nao configurada');
    process.env.FISCAL_SIMULATION_ENABLED = 'false';
    await expect(service.submit(requestId, 'a')).rejects.toThrow('nao configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not leak upstream body or credentials on error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('SECRET FROM UPSTREAM', { status: 500 }));
    await expect(service.submit(requestId, 'a')).rejects.toThrow('Nao foi possivel');
  });
});
