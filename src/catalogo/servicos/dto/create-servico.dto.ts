import { IsString, IsOptional, IsNumberString, IsNumber, IsBoolean } from 'class-validator';

export class CreateServicoDto {
  @IsString()
  empresaId: string;

  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  // Accept numeric string (frontend sends stringified number)
  @IsOptional()
  @IsNumberString()
  precoPadrao?: string;

  @IsOptional()
  @IsNumber()
  tempoEstimado?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
