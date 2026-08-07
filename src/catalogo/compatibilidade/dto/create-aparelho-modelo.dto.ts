import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAparelhoModeloDto {
  @IsOptional()
  @IsString()
  empresaId?: string;

  @IsString()
  marca: string;

  @IsString()
  modelo: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

