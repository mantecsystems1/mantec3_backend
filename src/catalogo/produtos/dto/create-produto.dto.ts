import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
  @IsString()
  precoVenda?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
