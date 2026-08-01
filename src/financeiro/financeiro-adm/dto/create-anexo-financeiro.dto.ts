import { IsDateString, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ANEXO_FINANCEIRO_VINCULO_TIPO } from '../schemas/anexo-financeiro.schema';

export class CreateAnexoFinanceiroDto {
  @IsOptional()
  @IsString()
  empresaId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  competencia?: string;

  @IsOptional()
  @IsDateString()
  periodoInicio?: string;

  @IsOptional()
  @IsDateString()
  periodoFim?: string;

  @IsOptional()
  @IsIn(Object.values(ANEXO_FINANCEIRO_VINCULO_TIPO))
  vinculoTipo?: string;

  @IsOptional()
  @IsString()
  vinculoId?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsDateString()
  dataReferencia?: string;
}
