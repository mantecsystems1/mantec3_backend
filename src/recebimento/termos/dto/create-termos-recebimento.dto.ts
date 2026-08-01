import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTermosRecebimentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  texto: string;

  @IsOptional()
  @IsBoolean()
  assinado?: boolean;

  @IsOptional()
  @IsString()
  metodoAssinatura?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataAssinatura?: Date;

  @IsOptional()
  @IsString()
  signatarioNome?: string;

  @IsOptional()
  @IsString()
  signatarioDocumento?: string;

  @IsOptional()
  @IsString()
  assinaturaImagemBase64?: string;

  @IsOptional()
  @IsString()
  assinaturaHashSha256?: string;

  @IsOptional()
  @IsString()
  termoHashSha256?: string;

  @IsOptional()
  @IsString()
  ipAssinatura?: string;

  @IsOptional()
  @IsString()
  userAgentAssinatura?: string;

  @IsOptional()
  @IsString()
  observacoesAssinatura?: string;
}
