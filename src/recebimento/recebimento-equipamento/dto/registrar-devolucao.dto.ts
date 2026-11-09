import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistrarDevolucaoDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  devolvidoParaNome: string;

  @IsEnum(['cliente', 'terceiro_autorizado'])
  devolvidoParaTipo: 'cliente' | 'terceiro_autorizado';

  @IsOptional()
  @IsBoolean()
  autorizacaoTerceiroConfirmada?: boolean;

  @IsString()
  @IsNotEmpty()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  assinaturaImagemBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;

  @IsOptional()
  @IsString()
  ipAssinatura?: string;

  @IsOptional()
  @IsString()
  userAgentAssinatura?: string;
}
