import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePedidoCompraItemDto } from './create-pedido-compra-item.dto';
export class CreatePedidoCompraDto {
  @IsString()
  empresaId: string;

  @IsString()
  fornecedorId: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoCompraItemDto)
  itens?: CreatePedidoCompraItemDto[];
}