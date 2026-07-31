import { Types } from 'mongoose';

export const VENDA_STATUS_FINANCEIRO = {
  PENDENTE: 'pendente',
  PARCIAL: 'parcial',
  PAGO: 'pago',
  CANCELADO: 'cancelado',
} as const;

export type VendaStatusFinanceiro = (typeof VENDA_STATUS_FINANCEIRO)[keyof typeof VENDA_STATUS_FINANCEIRO];

export function isVendaStatusFinanceiro(status: string): status is VendaStatusFinanceiro {
  return Object.values(VENDA_STATUS_FINANCEIRO).includes(status as VendaStatusFinanceiro);
}

export function decimalToNumber(value: unknown): number {
  if (value instanceof Types.Decimal128) {
    return Number(value.toString());
  }

  if (value && typeof value === 'object' && '$numberDecimal' in value) {
    return Number((value as { $numberDecimal: string }).$numberDecimal);
  }

  return Number(value ?? 0);
}

export function calcularStatusFinanceiroVenda(total: unknown, totalPago: number): VendaStatusFinanceiro {
  const totalVenda = decimalToNumber(total);

  if (totalPago <= 0) {
    return VENDA_STATUS_FINANCEIRO.PENDENTE;
  }

  if (totalPago + 0.00001 >= totalVenda) {
    return VENDA_STATUS_FINANCEIRO.PAGO;
  }

  return VENDA_STATUS_FINANCEIRO.PARCIAL;
}
