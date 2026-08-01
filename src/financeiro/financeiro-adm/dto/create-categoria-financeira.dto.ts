import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { CATEGORIA_FINANCEIRA_CLASSIFICACAO, CATEGORIA_FINANCEIRA_TIPO } from '../financeiro-adm.types';

export class CreateCategoriaFinanceiraDto {
  @IsString()
  empresaId: string;

  @IsString()
  nome: string;

  @IsIn(Object.values(CATEGORIA_FINANCEIRA_TIPO))
  tipo: string;

  @IsOptional()
  @IsString()
  grupo?: string;

  @IsOptional()
  @IsIn(Object.values(CATEGORIA_FINANCEIRA_CLASSIFICACAO))
  classificacao?: string;

  @IsOptional()
  @IsBoolean()
  recorrente?: boolean;

  @IsOptional()
  @IsBoolean()
  dedutivel?: boolean;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
