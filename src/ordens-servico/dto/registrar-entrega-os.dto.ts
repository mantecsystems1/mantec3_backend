import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegistrarEntregaOsDto {
  @IsString()
  @IsNotEmpty()
  entregueParaNome: string;

  @IsOptional()
  @IsString()
  entregueParaDocumento?: string;

  @IsString()
  @IsNotEmpty()
  assinaturaImagemBase64: string;

  @IsOptional()
  @IsString()
  observacoesEntrega?: string;

  @IsOptional()
  @IsString()
  ipAssinaturaEntrega?: string;

  @IsOptional()
  @IsString()
  userAgentAssinaturaEntrega?: string;
}
