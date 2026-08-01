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

  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @IsOptional()
  @IsString()
  fotoNomeOriginal?: string;

  @IsOptional()
  @IsString()
  fotoNomeArquivo?: string;

  @IsOptional()
  @IsString()
  fotoMimeType?: string;

  @IsOptional()
  @IsNumber()
  fotoTamanhoBytes?: number;

  @IsOptional()
  @IsString()
  fotoHashSha256?: string;

  @IsOptional()
  @IsString()
  fotoOrigemCaptura?: string;

  @IsOptional()
  @IsString()
  fotoCapturadaEm?: string;
}
