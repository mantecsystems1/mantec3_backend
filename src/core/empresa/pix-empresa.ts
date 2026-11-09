import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { isValidCpfCnpj } from '../../common/validators/cpf-cnpj';
import { PIX_TIPOS_CHAVE, type PixTipoChave, type UpdatePixEmpresaDto } from './dto/update-pix-empresa.dto';

export interface PixEmpresaPublico {
  habilitado: true;
  tipoChave: PixTipoChave;
  chave: string;
  nomeBeneficiario: string;
  cidadeBeneficiario: string;
}

// Formato local apenas. Não consulta o DICT nem confirma titularidade no banco.
// Fonte: Manual Operacional do DICT, seção de formatação de chaves (Banco Central).
export function normalizarPixEmpresa(dto: UpdatePixEmpresaDto): PixEmpresaPublico | { habilitado: false } {
  if (dto.habilitado === false) return { habilitado: false };
  if (dto.habilitado !== true || !PIX_TIPOS_CHAVE.includes(dto.tipoChave as PixTipoChave)) {
    throw new BadRequestException('Selecione o tipo da chave Pix.');
  }
  const tipoChave = dto.tipoChave as PixTipoChave;
  let chave = typeof dto.chave === 'string' ? dto.chave.trim() : '';
  const nomeBeneficiario = typeof dto.nomeBeneficiario === 'string' ? dto.nomeBeneficiario.trim() : '';
  const cidadeBeneficiario = typeof dto.cidadeBeneficiario === 'string' ? dto.cidadeBeneficiario.trim() : '';
  if (!nomeBeneficiario || nomeBeneficiario.length > 120 || !cidadeBeneficiario || cidadeBeneficiario.length > 80) {
    throw new BadRequestException('Informe o nome e a cidade do beneficiário Pix.');
  }
  if (tipoChave === 'cpf' || tipoChave === 'cnpj') {
    if (!isValidCpfCnpj(chave)) throw new BadRequestException('CPF ou CNPJ da chave Pix inválido.');
    chave = chave.replace(/\D/g, '');
    if (chave.length !== (tipoChave === 'cpf' ? 11 : 14)) throw new BadRequestException('A chave Pix não corresponde ao tipo selecionado.');
  } else if (tipoChave === 'email') {
    chave = chave.toLowerCase();
    if (chave.length > 77 || !isEmail(chave)) throw new BadRequestException('E-mail da chave Pix inválido (máximo de 77 caracteres).');
  } else if (tipoChave === 'telefone') {
    if (!/^\+[1-9]\d{1,14}$/.test(chave)) throw new BadRequestException('Informe o telefone Pix com +, código do país e DDD, sem espaços.');
  } else {
    chave = chave.toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(chave)) {
      throw new BadRequestException('Chave Pix aleatória inválida. Copie a chave cadastrada no banco.');
    }
  }
  return { habilitado: true, tipoChave, chave, nomeBeneficiario, cidadeBeneficiario };
}

export function getPixEmpresaPublico(value: unknown): PixEmpresaPublico | null {
  if (!value || typeof value !== 'object') return null;
  try {
    const pix = normalizarPixEmpresa(value as UpdatePixEmpresaDto);
    return pix.habilitado ? pix : null;
  } catch {
    return null;
  }
}
