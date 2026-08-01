import { IsDateString, IsOptional } from 'class-validator';

export class GerarRecorrenciasFinanceirasDto {
  @IsOptional()
  @IsDateString()
  ateCompetencia?: string;
}
