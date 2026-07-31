import { Types } from 'mongoose';
import { VENDA_STATUS_FINANCEIRO, calcularStatusFinanceiroVenda, decimalToNumber, isVendaStatusFinanceiro } from './venda-financeiro.states';

describe('venda financeiro states', () => {
  it('reconhece status oficiais', () => {
    expect(isVendaStatusFinanceiro(VENDA_STATUS_FINANCEIRO.PENDENTE)).toBe(true);
    expect(isVendaStatusFinanceiro('invalido')).toBe(false);
  });

  it('converte Decimal128 para numero', () => {
    const decimal = Types.Decimal128.fromString('123.45');

    expect(decimalToNumber(decimal)).toBe(123.45);
  });

  it('calcula status pendente quando nao ha pagamento', () => {
    expect(calcularStatusFinanceiroVenda('100', 0)).toBe(VENDA_STATUS_FINANCEIRO.PENDENTE);
  });

  it('calcula status parcial quando pagamento e menor que total', () => {
    expect(calcularStatusFinanceiroVenda('100', 40)).toBe(VENDA_STATUS_FINANCEIRO.PARCIAL);
  });

  it('calcula status pago quando pagamento fecha total', () => {
    expect(calcularStatusFinanceiroVenda('100', 100)).toBe(VENDA_STATUS_FINANCEIRO.PAGO);
  });
});
