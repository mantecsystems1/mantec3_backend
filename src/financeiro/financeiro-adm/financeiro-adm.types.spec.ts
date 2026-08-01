import { Types } from 'mongoose';
import {
  RECORRENCIA_FINANCEIRA_FREQUENCIA,
  TITULO_FINANCEIRO_STATUS,
  avancarCompetencia,
  calcularStatusTitulo,
  centavosParaDecimal128,
  dinheiroParaCentavos,
  FORMA_PAGAMENTO_FINANCEIRO,
  normalizarFormaPagamentoFinanceiro,
  vencimentoDaCompetencia,
} from './financeiro-adm.types';

describe('financeiro adm dominio', () => {
  it('converte valores monetarios em centavos', () => {
    expect(dinheiroParaCentavos('1234.56')).toBe(123456);
    expect(dinheiroParaCentavos('1.234,56')).toBe(123456);
    expect(dinheiroParaCentavos(Types.Decimal128.fromString('12.30'))).toBe(1230);
  });

  it('calcula status do titulo pelo total pago', () => {
    expect(calcularStatusTitulo('100.00', '0')).toBe(TITULO_FINANCEIRO_STATUS.ABERTO);
    expect(calcularStatusTitulo('100.00', '35.50')).toBe(TITULO_FINANCEIRO_STATUS.PARCIAL);
    expect(calcularStatusTitulo('100.00', centavosParaDecimal128(10000))).toBe(TITULO_FINANCEIRO_STATUS.QUITADO);
  });

  it('avanca competencia mensal mantendo calendario valido', () => {
    const next = avancarCompetencia(new Date(Date.UTC(2026, 0, 31)), RECORRENCIA_FINANCEIRA_FREQUENCIA.MENSAL);

    expect(next.getUTCFullYear()).toBe(2026);
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('limita vencimento ao ultimo dia do mes da competencia', () => {
    const vencimento = vencimentoDaCompetencia(new Date(Date.UTC(2026, 1, 1)), 31);

    expect(vencimento.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('normaliza formas de pagamento legadas para o livro caixa', () => {
    expect(normalizarFormaPagamentoFinanceiro('Cartao de Credito')).toBe(FORMA_PAGAMENTO_FINANCEIRO.CARTAO_CREDITO);
    expect(normalizarFormaPagamentoFinanceiro('Transferência')).toBe(FORMA_PAGAMENTO_FINANCEIRO.TRANSFERENCIA);
    expect(normalizarFormaPagamentoFinanceiro('PIX')).toBe(FORMA_PAGAMENTO_FINANCEIRO.PIX);
  });
});
