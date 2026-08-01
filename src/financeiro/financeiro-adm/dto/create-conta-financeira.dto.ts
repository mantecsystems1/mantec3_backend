import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { CONTA_FINANCEIRA_TIPO } from '../financeiro-adm.types';

export class CreateContaFinanceiraDto {
  @IsString()
  empresaId: string;

  @IsString()
  nome: string;

  @IsIn(Object.values(CONTA_FINANCEIRA_TIPO))
  tipo: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  agencia?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  saldoInicial?: string;

  @IsOptional()
  @IsString()
  moeda?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
