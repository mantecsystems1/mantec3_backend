import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PIX_TIPOS_CHAVE = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const;
export type PixTipoChave = (typeof PIX_TIPOS_CHAVE)[number];

export class UpdatePixEmpresaDto {
  @IsBoolean()
  habilitado!: boolean;

  @IsOptional()
  @IsIn(PIX_TIPOS_CHAVE)
  tipoChave?: PixTipoChave;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  chave?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomeBeneficiario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidadeBeneficiario?: string;
}
