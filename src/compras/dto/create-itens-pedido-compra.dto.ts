import { IsString, IsNumber, IsNumberString } from 'class-validator';

export class CreateItensPedidoCompraDto {
  @IsString()
  pedidoCompraId: string;

  @IsString()
  produtoId: string;

  @IsNumber()
  quantidade: number;

  @IsNumberString()
  valorUnitario: string;
}