import { IsInt, IsMongoId, IsNotEmpty, IsNumberString, IsString, Min } from 'class-validator';

export class CreateItensOrcamentoDto {
  @IsMongoId()
  @IsNotEmpty()
  orcamentoId: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsMongoId()
  @IsNotEmpty()
  referenciaId: string;

  @IsInt()
  @Min(1)
  quantidade: number;

  @IsNumberString()
  valorUnitario: string;

  @IsNumberString()
  totalItem: string;
}
