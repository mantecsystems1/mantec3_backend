import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { FORMA_PAGAMENTO_FINANCEIRO, MOVIMENTO_CAIXA_TIPO } from '../financeiro-adm.types';

export class CreateMovimentoCaixaDto {
  @IsString()
  empresaId: string;

  @IsString()
  contaId: string;

  @IsString()
  categoriaId: string;

  @IsIn(Object.values(MOVIMENTO_CAIXA_TIPO))
  tipo: string;

  @IsString()
  descricao: string;

  @IsString()
  valor: string;

  @IsDateString()
  dataMovimento: string;

  @IsIn(Object.values(FORMA_PAGAMENTO_FINANCEIRO))
  formaPagamento: string;

  @IsOptional()
  @IsString()
  origemTipo?: string;

  @IsOptional()
  @IsString()
  origemId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
