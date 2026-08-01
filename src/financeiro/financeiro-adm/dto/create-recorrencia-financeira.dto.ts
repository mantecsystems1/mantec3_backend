import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RECORRENCIA_FINANCEIRA_FREQUENCIA, RECORRENCIA_FINANCEIRA_STATUS, TITULO_FINANCEIRO_TIPO } from '../financeiro-adm.types';

export class CreateRecorrenciaFinanceiraDto {
  @IsString()
  empresaId: string;

  @IsIn(Object.values(TITULO_FINANCEIRO_TIPO))
  tipoTitulo: string;

  @IsString()
  categoriaId: string;

  @IsOptional()
  @IsString()
  contaId?: string;

  @IsString()
  descricao: string;

  @IsString()
  valor: string;

  @IsIn(Object.values(RECORRENCIA_FINANCEIRA_FREQUENCIA))
  frequencia: string;

  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento: number;

  @IsDateString()
  inicioEm: string;

  @IsOptional()
  @IsDateString()
  fimEm?: string;

  @IsOptional()
  @IsDateString()
  proximaCompetencia?: string;

  @IsOptional()
  @IsIn(Object.values(RECORRENCIA_FINANCEIRA_STATUS))
  status?: string;

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
  observacoes?: string;
}
