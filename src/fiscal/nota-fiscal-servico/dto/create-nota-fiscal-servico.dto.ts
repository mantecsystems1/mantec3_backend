import { IsOptional, IsString } from 'class-validator';

export class CreateNotaFiscalServicoDto {
  @IsString()
  vendaId: string;

  @IsString()
  numero: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  xml?: string;

  @IsOptional()
  @IsString()
  pdfUrl?: string;
}