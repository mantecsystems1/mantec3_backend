import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumberString, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ItemOrcamentoCompletoDto } from './create-orcamento-completo.dto';

export class UpdateOrcamentoCompletoDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) revisaoEsperada: number;
  @IsDateString() validade: string;
  @IsOptional() @IsNumberString() descontos?: string;
  @IsOptional() @IsString() @MaxLength(8000) observacoes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ItemOrcamentoCompletoDto)
  itens: ItemOrcamentoCompletoDto[];
}
