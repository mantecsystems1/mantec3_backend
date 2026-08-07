import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCreditoFornecedorDto {
  @IsString()
  fornecedorId: string;

  @IsString()
  garantiaId: string;

  @IsNumber()
  valor: number;

  @IsOptional()
  @IsBoolean()
  utilizado?: boolean;
}
