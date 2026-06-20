import { IsString, IsNotEmpty, IsEmail, IsMongoId, IsOptional } from 'class-validator';

export class CreateUsuarioDto {
  @IsMongoId()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  senha?: string;

  @IsString()
  @IsOptional()
  senhaHash?: string;
}
