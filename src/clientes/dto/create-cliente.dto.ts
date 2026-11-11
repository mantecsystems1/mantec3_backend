import {
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsCpfCnpj } from '../../common/validators/cpf-cnpj';

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

  /** Opcional. Quando informado, precisa ser um CPF ou CNPJ válido. Vazio remove o documento. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((dto: CreateClienteDto) => dto.cpfCnpj !== undefined && dto.cpfCnpj !== null && dto.cpfCnpj !== '')
  @IsString()
  @IsCpfCnpj()
  cpfCnpj?: string;

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
