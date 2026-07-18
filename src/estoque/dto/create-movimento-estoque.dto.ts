import { IsNumber, IsString } from 'class-validator';

export class CreateMovimentoEstoqueDto {
  @IsString()
  empresaId: string;

  @IsString()
  produtoId: string;

  @IsString()
  tipo: string;

  @IsNumber()
  quantidade: number;

  @IsString()
  origemTipo: string;

  @IsString()
  origemId: string;
}