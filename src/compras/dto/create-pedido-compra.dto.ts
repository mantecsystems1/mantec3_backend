import { IsString, IsOptional } from 'class-validator';

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
}