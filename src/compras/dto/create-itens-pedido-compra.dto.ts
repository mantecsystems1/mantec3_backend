import { IsString, IsNumber, IsNumberString } from 'class-validator';

export class CreateItensPedidoCompraDto {
  @IsString()
  pedidoCompraId: string;

  @IsString()
  produtoId: string;

  @IsNumber()
  quantidade: number;

  // frontend may send number-as-string
  @IsNumberString()
  valorUnitario: string;
}