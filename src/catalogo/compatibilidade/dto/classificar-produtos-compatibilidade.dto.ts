import { IsOptional, IsString } from 'class-validator';

export class ClassificarProdutosCompatibilidadeDto {
  @IsOptional()
  @IsString()
  empresaId?: string;
}

