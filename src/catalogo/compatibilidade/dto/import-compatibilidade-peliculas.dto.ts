import { IsArray, IsOptional, IsString } from 'class-validator';

export class ImportCompatibilidadePeliculasDto {
  @IsOptional()
  @IsString()
  empresaId?: string;

  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linhas?: string[];
}

