import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsObject,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateEnderecoDto {
  @IsString()
  @IsNotEmpty()
  logradouro: string;

  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsString()
  @IsOptional()
  complemento?: string;

  @IsString()
  @IsNotEmpty()
  bairro: string;

  @IsString()
  @IsNotEmpty()
  cidade: string;

  @IsString()
  @IsNotEmpty()
  estado: string;

  @IsString()
  @IsNotEmpty()
  cep: string;
}

export class CreateEmpresaDto {
  @IsString()
  @IsNotEmpty()
  nomeFantasia: string;

  @IsString()
  @IsNotEmpty()
  razaoSocial: string;

  @IsString()
  @IsNotEmpty()
  cnpj: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CreateEnderecoDto)
  endereco: CreateEnderecoDto;

  @IsBoolean()
  @IsOptional()
  ativa?: boolean;
}
