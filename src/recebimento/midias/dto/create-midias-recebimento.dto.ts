import { IsISO8601, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMidiasRecebimentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsString()
  @IsNotEmpty()
  urlArquivo: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  nomeOriginal?: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tamanhoBytes?: number;

  @IsOptional()
  @IsString()
  hashSha256?: string;

  @IsOptional()
  @IsString()
  origemCaptura?: string;

  @IsOptional()
  @IsISO8601()
  capturadoEm?: string;
}
