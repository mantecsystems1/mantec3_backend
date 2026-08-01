import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class ReabrirMesFinanceiroDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  competencia?: string;

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fim?: string;

  @IsString()
  motivo: string;
}
