import { IsIn, IsNumber, IsString } from 'class-validator';
import { MOVIMENTO_ESTOQUE_TIPO } from '../movimento-estoque.types';

export class CreateMovimentoEstoqueDto {
  @IsString()
  empresaId: string;

  @IsString()
  produtoId: string;

  @IsString()
  @IsIn(Object.values(MOVIMENTO_ESTOQUE_TIPO))
  tipo: string;

  @IsNumber()
  quantidade: number;

  @IsString()
  origemTipo: string;

  @IsString()
  origemId: string;
}
