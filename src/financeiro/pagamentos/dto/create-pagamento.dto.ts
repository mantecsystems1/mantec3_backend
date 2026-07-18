import { IsString } from 'class-validator';

export class CreatePagamentoDto {
  @IsString()
  vendaId: string;

  @IsString()
  formaPagamento: string;

  @IsString()
  valor: string;

  @IsString()
  dataPagamento: string;
}