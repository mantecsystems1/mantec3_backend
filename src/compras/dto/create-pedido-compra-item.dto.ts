import { IsNumber, IsNumberString, IsString } from 'class-validator';

export class CreatePedidoCompraItemDto {
  @IsString()
  produtoId: string;

  @IsNumber()
  quantidade: number;

  @IsNumberString()
  valorUnitario: string;
}