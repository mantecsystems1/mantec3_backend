import { IsNumber, IsString } from 'class-validator';

export class CreateItensVendaDto {
  @IsString()
  vendaId: string;

  @IsString()
  tipo: string;

  @IsString()
  referenciaId: string;

  @IsNumber()
  quantidade: number;

  @IsString()
  valorUnitario: string;

  @IsString()
  totalItem: string;
}