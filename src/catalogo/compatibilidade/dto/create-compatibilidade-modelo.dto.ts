import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCompatibilidadeModeloDto {
  @IsOptional()
  @IsString()
  empresaId?: string;

  @IsOptional()
  @IsString()
  tipoProduto?: string;

  @IsString()
  modeloBaseId: string;

  @IsString()
  modeloCompativelId: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

