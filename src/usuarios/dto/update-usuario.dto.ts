import { IsString, IsEmail, IsMongoId, IsOptional } from 'class-validator';

export class UpdateUsuarioDto {
  @IsMongoId()
  @IsOptional()
  empresaId?: string;

  @IsString()
  @IsOptional()
  nome?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  senha?: string;

  @IsString()
  @IsOptional()
  senhaHash?: string;

  @IsString()
  @IsOptional()
  perfil?: string;
}
