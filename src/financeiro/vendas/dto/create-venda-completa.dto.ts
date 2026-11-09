import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsNumberString, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class ItemVendaCompletaDto {
  @IsIn(['produto', 'servico']) tipo: string;
  @IsMongoId() referenciaId: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) quantidade: number;
  @IsNumberString() valorUnitario: string;
}

export class CreateVendaCompletaDto {
  @IsUUID() operacaoId: string;
  @IsMongoId() clienteId: string;
  @IsIn(['venda_direta', 'ordem_servico']) origemTipo: string;
  @IsMongoId() origemId: string;
  @IsOptional() @IsNumberString() descontos?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ItemVendaCompletaDto)
  itens: ItemVendaCompletaDto[];
}
