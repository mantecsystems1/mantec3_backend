import { IsOptional, IsString } from 'class-validator';

export class EstornarMovimentoCaixaDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
