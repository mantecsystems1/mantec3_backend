import { IsBoolean, IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistrarEntregaOsDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  entregueParaNome: string;

  @IsDefined()
  @IsEnum(['cliente', 'terceiro_autorizado'])
  entregueParaTipo?: 'cliente' | 'terceiro_autorizado';

  @IsOptional()
  @IsBoolean()
  autorizacaoTerceiroConfirmada?: boolean;

  @IsOptional()
  @IsString()
  entregueParaDocumento?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
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
