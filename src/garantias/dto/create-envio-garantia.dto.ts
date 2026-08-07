import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateEnvioGarantiaDto {
  @IsString()
  garantiaId: string;

  @IsDateString()
  dataEnvio: Date;

  @IsOptional()
  @IsString()
  codigoRastreio?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
