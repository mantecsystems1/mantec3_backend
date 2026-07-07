import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFornecedorDto {
  @IsString()
  empresaId: string;

  @IsString()
  nome: string;

  @IsString()
  cnpj: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
