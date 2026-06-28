import {
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ClienteEnderecoDto {
  @IsOptional()
  @IsString()
  logradouro?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  bairro?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  cep?: string;
}

export class CreateClienteDto {
  @IsMongoId()
  @IsNotEmpty()
  empresaId: string;

  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClienteEnderecoDto)
  endereco?: ClienteEnderecoDto;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
