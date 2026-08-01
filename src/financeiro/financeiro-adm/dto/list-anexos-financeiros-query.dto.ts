import { IsDateString, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ANEXO_FINANCEIRO_VINCULO_TIPO } from '../schemas/anexo-financeiro.schema';

export class ListAnexosFinanceirosQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  competencia?: string;

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fim?: string;

  @IsOptional()
  @IsIn(Object.values(ANEXO_FINANCEIRO_VINCULO_TIPO))
  vinculoTipo?: string;

  @IsOptional()
  @IsString()
  vinculoId?: string;
}
