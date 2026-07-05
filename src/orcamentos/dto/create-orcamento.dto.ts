import { IsDateString, IsMongoId, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateOrcamentoDto {
  @IsMongoId()
  @IsNotEmpty()
  empresaId: string;

  @IsMongoId()
  @IsNotEmpty()
  clienteId: string;

  @IsMongoId()
  @IsNotEmpty()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsDateString()
  validade: string;

  @IsNumberString()
  subtotal: string;

  @IsOptional()
  @IsNumberString()
  descontos?: string;

  @IsNumberString()
  total: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsMongoId()
  @IsNotEmpty()
  criadoPor: string;
}
