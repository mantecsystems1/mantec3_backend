import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { FORMA_PAGAMENTO_FINANCEIRO } from '../financeiro-adm.types';

export class BaixarTituloFinanceiroDto {
  @IsString()
  contaId: string;

  @IsString()
  valor: string;

  @IsDateString()
  dataPagamento: string;

  @IsIn(Object.values(FORMA_PAGAMENTO_FINANCEIRO))
  formaPagamento: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
