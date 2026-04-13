import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProdutoDto {
  @IsString()
  empresaId: string;

  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  codigoInterno?: string;

  @IsOptional()
  @IsNumber()
  precoVenda?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
