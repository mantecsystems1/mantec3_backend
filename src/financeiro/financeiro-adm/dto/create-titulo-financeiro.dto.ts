import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { TITULO_FINANCEIRO_TIPO } from '../financeiro-adm.types';

export class CreateTituloFinanceiroDto {
  @IsString()
  empresaId: string;

  @IsIn(Object.values(TITULO_FINANCEIRO_TIPO))
  tipo: string;

  @IsString()
  categoriaId: string;

  @IsOptional()
  @IsString()
  contaId?: string;

  @IsString()
  descricao: string;

  @IsString()
  valorTotal: string;

  @IsDateString()
  dataCompetencia: string;

  @IsDateString()
  dataVencimento: string;

  @IsOptional()
  @IsString()
  contraparteTipo?: string;

  @IsOptional()
  @IsString()
  contraparteId?: string;

  @IsOptional()
  @IsString()
  documentoNumero?: string;

  @IsOptional()
  @IsString()
  origemTipo?: string;

  @IsOptional()
  @IsString()
  origemId?: string;

  @IsOptional()
  @IsString()
  recorrenciaId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
