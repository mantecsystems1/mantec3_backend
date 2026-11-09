import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ItemOrcamentoCompletoDto {
  @IsIn(['produto', 'servico']) tipo: string;
  @IsMongoId() referenciaId: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) quantidade: number;
  @IsNumberString() valorUnitario: string;
}

export class CreateOrcamentoCompletoDto {
  @IsUUID() operacaoId: string;
  @IsMongoId() clienteId: string;
  @IsMongoId() recebimentoEquipamentoId: string;
  @IsDateString() validade: string;
  @IsOptional() @IsNumberString() descontos?: string;
  @IsOptional() @IsString() @MaxLength(8000) observacoes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ItemOrcamentoCompletoDto)
  itens: ItemOrcamentoCompletoDto[];
}
