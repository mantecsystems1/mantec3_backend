import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateVendaDto {
  @IsString()
  empresaId: string;

  @IsString()
  clienteId: string;

  @IsString()
  origemTipo: string;

  @IsString()
  origemId: string;

  @IsString()
  subtotal: string;

  @IsOptional()
  @IsString()
  descontos?: string;

  @IsString()
  total: string;

  @IsString()
  statusFinanceiro: string;

  @IsOptional()
  @IsArray()
  itens?: any[];
}