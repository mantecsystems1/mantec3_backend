import type { Empresa } from '../../core/empresa/schemas/empresa.schema';
import { isEmail } from 'class-validator';

export interface FiscalPendingItem {
  code: string;
  title: string;
  description: string;
  severity: 'warning' | 'error' | 'info';
  target: '/minha-empresa';
}

export function pendingItem(code: string, title: string, description: string,
  severity: FiscalPendingItem['severity'] = 'warning'): FiscalPendingItem {
  return { code, title, description, severity, target: '/minha-empresa' };
}

const text = (value?: string) => value?.trim().normalize('NFC') ?? '';
const city = (value?: string) => text(value).toLocaleUpperCase('pt-BR');
const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function validCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  return [12, 13].every(length => {
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * ((length - index - 1) % 8 + 2), 0);
    return digits[length] === (sum % 11 < 2 ? 0 : 11 - sum % 11);
  });
}

export function companyPendingItems(company: Empresa): FiscalPendingItem[] {
  const items: FiscalPendingItem[] = [];
  const address = company.endereco;
  const required = [company.nomeFantasia, company.razaoSocial, company.cnpj, company.email, company.telefone,
    address?.logradouro, address?.numero, address?.bairro, address?.cidade, address?.estado, address?.cep];
  if (required.some(value => !text(value))) items.push(pendingItem('COMPANY_INCOMPLETE', 'Dados da empresa incompletos',
    'Preencha os campos obrigatórios de identificação, contato e endereço em Dados da empresa.'));
  if (text(company.cnpj) && (/[^\d./\s-]/.test(company.cnpj) || !validCnpj(company.cnpj.replace(/\D/g, '')))) items.push(pendingItem('COMPANY_CNPJ_INVALID',
    'Confira o CNPJ da empresa', 'O CNPJ salvo não passou na validação de formato e dígitos verificadores.', 'error'));
  if (text(company.email) && !isEmail(text(company.email))) items.push(pendingItem('COMPANY_EMAIL_INVALID',
    'Confira o e-mail da empresa', 'Informe um endereço de e-mail válido nos dados de contato.'));
  if (text(address?.estado) && !states.has(text(address?.estado).toUpperCase())) items.push(pendingItem('COMPANY_STATE_INVALID',
    'Confira a UF da empresa', 'Informe uma UF válida no endereço da empresa.'));
  return items;
}

export function sameFiscalIdentity(company: Empresa, emitter: Record<string, unknown>): boolean {
  return company.cnpj?.replace(/\D/g, '') === emitter.cnpj
    && text(company.razaoSocial) === text(emitter.legalName as string)
    && city(company.endereco?.cidade) === city(emitter.city as string)
    && text(company.endereco?.estado).toUpperCase() === emitter.state;
}

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

export function hasCurrentFiscalProfile(data: Record<string, unknown>, today: string): boolean {
  if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || !Array.isArray(data.items)) throw new Error('Invalid profiles');
  const profiles = data.items as unknown[];
  const active = profiles.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid profile');
    const p = item as Record<string, unknown>;
    if (!Number.isSafeInteger(p.version) || (p.version as number) < 1 || !isDate(p.validFrom)
      || (p.validUntilExclusive != null && (!isDate(p.validUntilExclusive) || p.validUntilExclusive <= p.validFrom))
      || typeof p.regime !== 'string' || !['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'].includes(p.regime)
      || typeof p.municipalityCode !== 'string' || !/^\d{7}$/.test(p.municipalityCode)) throw new Error('Invalid profile');
    return p.validFrom <= today && (p.validUntilExclusive == null || today < (p.validUntilExclusive as string));
  }).filter(Boolean).length;
  if (active > 1) throw new Error('Ambiguous profile');
  return active === 1;
}
