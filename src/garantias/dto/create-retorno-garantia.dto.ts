import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRetornoGarantiaDto {
  @IsString()
  garantiaId: string;

  @IsString()
  tipoRetorno: string;

  @IsOptional()
  @IsString()
  produtoSubstitutoId?: string;

  @IsOptional()
  @IsNumber()
  valorCredito?: number;

  @IsDateString()
  dataRetorno: Date;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
