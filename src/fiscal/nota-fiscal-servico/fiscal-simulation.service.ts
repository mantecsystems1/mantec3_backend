import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { FiscalBinding } from './fiscal-binding.schema';
import { FiscalProfileDto, RegisterFiscalEmitterDto, UploadFiscalCertificateDto } from './fiscal-configuration.dto';
import { FiscalRegistration } from './fiscal-registration.schema';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FiscalSimulation, FiscalSimulationDocument } from './fiscal-simulation.schema';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(['pending', 'processing', 'reconciliation_required', 'simulated_authorized', 'simulated_rejected', 'technical_failure']);

@Injectable()
export class FiscalSimulationService {
  constructor(@InjectModel(FiscalSimulation.name) private readonly model: Model<FiscalSimulation>,
    @Optional() @InjectModel(FiscalBinding.name) private readonly bindings?: Model<FiscalBinding>,
    @Optional() @InjectModel(FiscalRegistration.name) private readonly registrations?: Model<FiscalRegistration>) {}

  private async config(empresaId?: string, candidate?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    const stored = candidate ? null : await this.bindings?.findOne({ empresaId }).lean().exec();
    try {
      if (process.env.FISCAL_SIMULATION_ENABLED !== 'true') throw new Error();
      const base = new URL(process.env.FISCAL_API_URL ?? '');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if ((!local && base.protocol !== 'https:') || !['http:', 'https:'].includes(base.protocol)
        || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
      if (process.env.FISCAL_API_KEY && process.env.FISCAL_API_KEY_FILE) throw new Error();
      const key = process.env.FISCAL_API_KEY_FILE
        ? readFileSync(process.env.FISCAL_API_KEY_FILE, 'utf8').trim() : process.env.FISCAL_API_KEY;
      if (key && key.length > 4096) throw new Error();
      const bindings: unknown = JSON.parse(process.env.FISCAL_SIMULATION_EMITTERS_JSON ?? '{}');
      if (!key || !bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw new Error();
      const emitterId: unknown = candidate ?? stored?.emitterId ?? (bindings as Record<string, unknown>)[empresaId];
      if (typeof emitterId !== 'string' || !uuid.test(emitterId)) throw new Error();
      return { base, key, emitterId, empresaId };
    } catch { throw new ServiceUnavailableException('Simulacao fiscal nao configurada para esta empresa.'); }
  }

  async availability(empresaId?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    try { await this.config(empresaId); return { enabled: true, fiscalValidity: false }; }
    catch { return { enabled: false, fiscalValidity: false }; }
  }

  async history(empresaId?: string, before?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    if (before && !/^[a-f0-9]{24}$/i.test(before)) throw new BadRequestException('Cursor invalido.');
    const rows = await this.model.find({ empresaId, ...(before ? { _id: { $lt: before } } : {}) })
      .select('requestId createdAt receiptSha256 documentId').sort({ _id: -1 }).limit(21).exec();
    const items = rows.slice(0, 20).map(row => ({ requestId: row.requestId, createdAt: row.createdAt,
      receiptAvailable: !!row.receiptSha256, fiscalValidity: false }));
    return { items, nextCursor: rows.length > 20 ? String(rows[19]._id) : null };
  }

  async receipt(requestId: string, empresaId?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    const record = await this.model.findOne({ empresaId, requestId }).exec();
    if (!record) throw new NotFoundException('Simulacao nao encontrada.');
    if (!record.receiptContent || !record.receiptSha256) throw new ConflictException('Consulte o resultado concluido antes de baixar o comprovante.');
    if (createHash('sha256').update(record.receiptContent).digest('hex') !== record.receiptSha256) {
      throw new ServiceUnavailableException('Integridade do comprovante invalida.');
    }
    return { content: record.receiptContent, sha256: record.receiptSha256 };
  }

  private async archive(data: Record<string, unknown>, record: FiscalSimulationDocument) {
    if (!['simulated_authorized', 'simulated_rejected', 'technical_failure'].includes(String(data.status))) return;
    const content = JSON.stringify({ format: 'mantec-simulation-receipt-v1', warning: 'SIMULAÇÃO — SEM VALIDADE FISCAL',
      fiscalValidity: false, mode: 'simulado', requestId: record.requestId, documentId: data.id,
      emitterId: record.emitterId, competenceDate: record.competenceDate, amount: '1.00', status: data.status }, null, 2) + '\n';
    // First confirmed terminal result is immutable, including under concurrent reads.
    await this.model.updateOne({ _id: record._id, empresaId: record.empresaId, receiptContent: { $exists: false } },
      { $set: { receiptContent: content, receiptSha256: createHash('sha256').update(content).digest('hex') } }).exec();
  }

  private async remote(config: Awaited<ReturnType<FiscalSimulationService['config']>>, path: string, init: RequestInit = {}) {
    try {
      const response = await fetch(new URL(path, config.base), { ...init, redirect: 'error',
        signal: AbortSignal.timeout(10000), headers: { ...init.headers, 'x-api-key': config.key, 'Content-Type': 'application/json' } });
      if (response.status === 409) throw new ConflictException('Conflito fiscal. Recarregue o perfil e confira a vigencia antes de tentar novamente.');
      if (!response.ok) throw new Error();
      // Consume bounded data while the timeout remains active.
      if (!response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 65536) { await reader.cancel(); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadGatewayException('Nao foi possivel confirmar a operacao fiscal. Consulte o estado antes de repetir a mesma tentativa.');
    }
  }

  private view(data: Record<string, unknown>, record: FiscalSimulationDocument) {
    if (data.mode !== 'simulado' || data.fiscalValidity !== false || data.emitterId !== record.emitterId
      || data.reference !== `ERP-SIM-${record.requestId}` || typeof data.id !== 'string' || !uuid.test(data.id)
      || (record.documentId && data.id !== record.documentId) || typeof data.status !== 'string' || !statuses.has(data.status)) {
      throw new BadGatewayException('Resposta fiscal incompatível com a simulacao solicitada.');
    }
    return { requestId: record.requestId, status: data.status, fiscalValidity: false, mode: 'simulado',
      amount: '1.00', warning: 'SIMULAÇÃO — SEM VALIDADE FISCAL' };
  }

  async submit(requestId: string, empresaId?: string) {
    const config = await this.config(empresaId);
    let record: FiscalSimulationDocument | null;
    try {
      record = await this.model.findOneAndUpdate({ empresaId: config.empresaId, requestId }, { $setOnInsert: {
        empresaId: config.empresaId, requestId, emitterId: config.emitterId, competenceDate: new Date().toISOString().slice(0, 10),
      } }, { upsert: true, returnDocument: 'after', runValidators: true }).exec();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      record = await this.model.findOne({ empresaId: config.empresaId, requestId }).exec();
    }
    if (!record || record.emitterId !== config.emitterId) throw new ServiceUnavailableException('Vinculo da simulacao alterado; contate o administrador.');
    if (record.documentId) return this.get(requestId, empresaId);
    const data = await this.remote(config, '/v1/nfse', { method: 'POST',
      headers: { 'Idempotency-Key': `erp_${config.empresaId}_${requestId}` },
      body: JSON.stringify({ emitterId: record.emitterId, competenceDate: record.competenceDate,
        reference: `ERP-SIM-${requestId}`, description: 'Servico ficticio para testar integracao do ERP', amount: '1.00', scenario: 'accepted' }),
    });
    const view = this.view(data, record);
    await this.model.updateOne({ _id: record._id, empresaId: config.empresaId }, { $set: { documentId: data.id } }).exec();
    await this.archive(data, record);
    return view;
  }

  async get(requestId: string, empresaId?: string) {
    const config = await this.config(empresaId);
    const record = await this.model.findOne({ empresaId: config.empresaId, requestId }).exec();
    if (!record) throw new NotFoundException('Simulacao nao encontrada.');
    if (record.emitterId !== config.emitterId) throw new ServiceUnavailableException('Vinculo da simulacao alterado.');
    if (!record.documentId) return { requestId, status: 'awaiting_confirmation', fiscalValidity: false, mode: 'simulado', amount: '1.00' };
    const data = await this.remote(config, `/v1/documents/${record.documentId}`);
    const view = this.view(data, record);
    await this.archive(data, record);
    return view;
  }

  private assertManager(user?: CurrentUserPayload, masterOnly = false) {
    const roles = masterOnly ? ['admin', 'administrador'] : ['admin', 'administrador', 'admin_empresa'];
    if (!user?.empresaId || !user.id) throw new UnauthorizedException('Usuario/empresa nao informados.');
    if (!roles.includes(user.perfil ?? '')) throw new ForbiddenException('Somente administrador autorizado pode configurar o fiscal.');
    return user;
  }

  async bindEmitter(emitterId: string, actor?: CurrentUserPayload) {
    const user = this.assertManager(actor, true);
    if (!this.bindings || !uuid.test(emitterId)) throw new BadRequestException('Vinculo fiscal invalido.');
    const config = await this.config(user.empresaId, emitterId);
    let legacy: Record<string, unknown>;
    try { legacy = JSON.parse(process.env.FISCAL_SIMULATION_EMITTERS_JSON ?? '{}'); }
    catch { throw new ServiceUnavailableException('Configuracao legada invalida.'); }
    if (Object.entries(legacy).some(([empresa, emitter]) => empresa !== user.empresaId && emitter === emitterId)
      || (legacy[user.empresaId] && legacy[user.empresaId] !== emitterId)) throw new ConflictException('Vinculo legado conflitante.');
    const emitter = await this.remote(config, `/v1/emitters/${emitterId}`);
    if (emitter.id !== emitterId || emitter.fiscalReadiness !== 'simulation_only') throw new BadGatewayException('Emitente incompatível.');
    const previous = await this.model.findOne({ empresaId: user.empresaId, emitterId: { $ne: emitterId } }).exec();
    if (previous) throw new ConflictException('Empresa ja possui operacoes com outro emitente.');
    try {
      const stored = await this.bindings.findOneAndUpdate({ empresaId: user.empresaId },
        { $setOnInsert: { empresaId: user.empresaId, emitterId, createdBy: user.id } },
        { upsert: true, returnDocument: 'after', runValidators: true }).exec();
      if (stored?.emitterId !== emitterId) throw new ConflictException('Vinculo existente nao pode ser substituido por esta tela.');
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Emitente ja vinculado. Recarregue a configuracao.');
      throw error;
    }
    return { configured: true, fiscalValidity: false };
  }

  async fiscalProfiles(actor?: CurrentUserPayload) {
    const user = this.assertManager(actor);
    const config = await this.config(user.empresaId);
    const data = await this.remote(config, `/v1/emitters/${config.emitterId}/fiscal-profiles`);
    if (!Number.isInteger(data.revision) || !Array.isArray(data.items)) throw new BadGatewayException('Perfil fiscal invalido.');
    return { revision: data.revision, items: data.items.map((p: Record<string, unknown>) => ({
      version: p.version, validFrom: p.validFrom, validUntilExclusive: p.validUntilExclusive,
      regime: p.regime, municipalityCode: p.municipalityCode, municipalRegistration: p.municipalRegistration,
    })), mode: 'simulado', officialRegistrationVerified: false };
  }

  async uploadCertificate(dto: UploadFiscalCertificateDto, actor?: CurrentUserPayload) {
    const request: RequestInit = { method: 'POST' };
    try {
      const user = this.assertManager(actor);
      const config = await this.config(user.empresaId);
      request.body = JSON.stringify({ expectedRevision: dto.expectedRevision, pfxBase64: dto.pfxBase64,
        password: dto.password, reason: dto.reason + ' [ERP usuario ' + user.id + ']' });
      await this.remote(config, '/v1/emitters/' + config.emitterId + '/certificates', request);
      return { received: true, officialReady: false };
    } finally {
      dto.password = ''; dto.pfxBase64 = ''; request.body = undefined;
    }
  }

  async certificateStatus(actor?: CurrentUserPayload) {
    const user = this.assertManager(actor);
    const config = await this.config(user.empresaId);
    const data = await this.remote(config, `/v1/emitters/${config.emitterId}/certificate-status`);
    const states = ['missing', 'disabled', 'expired', 'not_yet_valid', 'expiring', 'valid'];
    if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || typeof data.state !== 'string' || !states.includes(data.state) || data.officialReady !== false) {
      throw new BadGatewayException('Resposta de certificado invalida.');
    }
    if (data.state === 'missing') {
      if (data.current !== null || data.daysRemaining !== null) throw new BadGatewayException('Resposta de certificado inconsistente.');
      return { revision: data.revision as number, state: 'missing', daysRemaining: null, validFrom: null, validTo: null,
        officialReady: false, revocationChecked: false };
    }
    const current = data.current as Record<string, unknown> | null;
    if (!current || typeof current !== 'object' || Array.isArray(current)
      || typeof current.validFrom !== 'string' || typeof current.validTo !== 'string'
      || !Number.isFinite(Date.parse(current.validFrom)) || !Number.isFinite(Date.parse(current.validTo))
      || Date.parse(current.validFrom) >= Date.parse(current.validTo) || !Number.isInteger(data.daysRemaining)) {
      throw new BadGatewayException('Metadados de certificado invalidos.');
    }
    // Whitelist only what the screen needs; never forward history, subject or raw upstream data.
    return { revision: data.revision as number, state: data.state, daysRemaining: data.daysRemaining as number,
      validFrom: new Date(current.validFrom).toISOString(), validTo: new Date(current.validTo).toISOString(),
      officialReady: false, revocationChecked: false };
  }

  async registrationStatus(actor?: CurrentUserPayload) {
    const user = this.assertManager(actor, true);
    const item = await this.registrations?.findOne({ empresaId: user.empresaId }).lean().exec();
    return { pending: !!item && !item.emitterId, payload: item?.payload ?? null, completed: !!item?.emitterId, fiscalValidity: false };
  }

  async registerEmitter(dto: RegisterFiscalEmitterDto, actor?: CurrentUserPayload) {
    const user = this.assertManager(actor, true);
    if (!this.registrations || !this.bindings) throw new ServiceUnavailableException('Cadastro fiscal indisponivel.');
    // Validate configuration before recording a request. The candidate is only a format placeholder, never transmitted.
    const config = await this.config(user.empresaId, '00000000-0000-4000-8000-000000000000');
    const existingBinding = await this.bindings.findOne({ empresaId: user.empresaId }).lean().exec();
    if (existingBinding && !await this.registrations.exists({ empresaId: user.empresaId })) {
      throw new ConflictException('Empresa ja possui vinculo; cadastro existente nao sera substituido.');
    }
    const payload = { cnpj: dto.cnpj, legalName: dto.legalName.trim(), city: dto.city.trim(), state: dto.state };
    if (payload.legalName.length < 2 || payload.city.length < 2) throw new BadRequestException('Nome e cidade devem conter ao menos dois caracteres.');
    if (!/^\d{14}$/.test(payload.cnpj) || /^(\d)\1{13}$/.test(payload.cnpj)) throw new BadRequestException('CNPJ invalido.');
    const digits = payload.cnpj.split('').map(Number);
    for (const length of [12, 13]) {
      const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * ((length - index - 1) % 8 + 2), 0);
      if (digits[length] !== (sum % 11 < 2 ? 0 : 11 - sum % 11)) throw new BadRequestException('CNPJ invalido.');
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    let saved;
    try {
      saved = await this.registrations.findOneAndUpdate({ empresaId: user.empresaId }, { $setOnInsert: {
        empresaId: user.empresaId, createdBy: user.id, payloadHash, payload,
      } }, { upsert: true, returnDocument: 'after', runValidators: true }).exec();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      saved = await this.registrations.findOne({ empresaId: user.empresaId }).exec();
    }
    if (!saved || saved.payloadHash !== payloadHash) throw new ConflictException('Cadastro em andamento possui dados diferentes. Recupere a tentativa original.');
    if (saved.emitterId) return this.bindEmitter(saved.emitterId, user);
    const emitter = await this.remote(config, '/v1/emitters/ensure', { method: 'POST', body: JSON.stringify(saved.payload) });
    if (typeof emitter.id !== 'string' || !uuid.test(emitter.id) || emitter.fiscalReadiness !== 'simulation_only'
      || Object.entries(payload).some(([key, value]) => emitter[key] !== value)) throw new BadGatewayException('Cadastro remoto incompatível.');
    const result = await this.bindEmitter(emitter.id, user);
    await this.registrations.updateOne({ _id: saved._id, empresaId: user.empresaId }, { $set: { emitterId: emitter.id } }).exec();
    return result;
  }

  async addFiscalProfile(dto: FiscalProfileDto, actor?: CurrentUserPayload) {
    const user = this.assertManager(actor);
    const config = await this.config(user.empresaId);
    const date = new Date(`${dto.validFrom}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== dto.validFrom) throw new BadRequestException('Data invalida.');
    await this.remote(config, `/v1/emitters/${config.emitterId}/fiscal-profiles`, { method: 'POST',
      body: JSON.stringify({ expectedRevision: dto.expectedRevision, validFrom: dto.validFrom, regime: dto.regime,
        municipalityCode: dto.municipalityCode, municipalRegistration: dto.municipalRegistration,
        reason: `${dto.reason} [ERP usuario ${user.id}]` }) });
    return this.fiscalProfiles(user);
  }
}
