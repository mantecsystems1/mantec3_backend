import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateGarantiaDto {
  @IsString()
  empresaId: string;

  @IsString()
  clienteId: string;

  @IsOptional()
  @IsString()
  vendaId?: string;

  @IsOptional()
  @IsString()
  ordemServicoId?: string;

  @IsString()
  produtoId: string;

  @IsInt()
  @Min(1)
  quantidade: number;

  @IsString()
  motivo: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  fornecedorId?: string;
}
