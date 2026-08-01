import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertTemplateComunicacaoDto {
  @IsString()
  chave: string;

  @IsString()
  nome: string;

  @IsString()
  assunto: string;

  @IsString()
  mensagem: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variaveis?: string[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
