import { Types } from 'mongoose';

export const CONTA_FINANCEIRA_TIPO = {
  CAIXA: 'caixa',
  CONTA_BANCARIA: 'conta_bancaria',
  CARTAO_CREDITO: 'cartao_credito',
  CARTEIRA_DIGITAL: 'carteira_digital',
} as const;

export const CATEGORIA_FINANCEIRA_TIPO = {
  ENTRADA: 'entrada',
  SAIDA: 'saida',
} as const;

export const CATEGORIA_FINANCEIRA_CLASSIFICACAO = {
  EMPRESA: 'empresa',
  PESSOAL: 'pessoal',
  MISTA: 'mista',
} as const;

export const TITULO_FINANCEIRO_TIPO = {
  RECEBER: 'receber',
  PAGAR: 'pagar',
} as const;

export const TITULO_FINANCEIRO_STATUS = {
  ABERTO: 'aberto',
  PARCIAL: 'parcial',
  QUITADO: 'quitado',
  CANCELADO: 'cancelado',
} as const;

export const MOVIMENTO_CAIXA_TIPO = {
  ENTRADA: 'entrada',
  SAIDA: 'saida',
} as const;

export const MOVIMENTO_CAIXA_STATUS = {
  CONFIRMADO: 'confirmado',
  ESTORNADO: 'estornado',
} as const;

export const FORMA_PAGAMENTO_FINANCEIRO = {
  DINHEIRO: 'dinheiro',
  PIX: 'pix',
  CARTAO_DEBITO: 'cartao_debito',
  CARTAO_CREDITO: 'cartao_credito',
  BOLETO: 'boleto',
  TRANSFERENCIA: 'transferencia',
  OUTRO: 'outro',
} as const;

export const RECORRENCIA_FINANCEIRA_FREQUENCIA = {
  SEMANAL: 'semanal',
  QUINZENAL: 'quinzenal',
  MENSAL: 'mensal',
  ANUAL: 'anual',
} as const;

export const RECORRENCIA_FINANCEIRA_STATUS = {
  ATIVA: 'ativa',
  PAUSADA: 'pausada',
  ENCERRADA: 'encerrada',
} as const;

export type ContaFinanceiraTipo = (typeof CONTA_FINANCEIRA_TIPO)[keyof typeof CONTA_FINANCEIRA_TIPO];
export type CategoriaFinanceiraTipo = (typeof CATEGORIA_FINANCEIRA_TIPO)[keyof typeof CATEGORIA_FINANCEIRA_TIPO];
export type TituloFinanceiroTipo = (typeof TITULO_FINANCEIRO_TIPO)[keyof typeof TITULO_FINANCEIRO_TIPO];
export type MovimentoCaixaTipo = (typeof MOVIMENTO_CAIXA_TIPO)[keyof typeof MOVIMENTO_CAIXA_TIPO];
export type RecorrenciaFinanceiraFrequencia = (typeof RECORRENCIA_FINANCEIRA_FREQUENCIA)[keyof typeof RECORRENCIA_FINANCEIRA_FREQUENCIA];

export function tituloTipoParaCategoriaTipo(tipo: string): CategoriaFinanceiraTipo {
  return tipo === TITULO_FINANCEIRO_TIPO.RECEBER
    ? CATEGORIA_FINANCEIRA_TIPO.ENTRADA
    : CATEGORIA_FINANCEIRA_TIPO.SAIDA;
}

export function tituloTipoParaMovimentoTipo(tipo: string): MovimentoCaixaTipo {
  return tipo === TITULO_FINANCEIRO_TIPO.RECEBER
    ? MOVIMENTO_CAIXA_TIPO.ENTRADA
    : MOVIMENTO_CAIXA_TIPO.SAIDA;
}

export function dinheiroParaCentavos(value: unknown): number {
  if (value instanceof Types.Decimal128) {
    return dinheiroParaCentavos(value.toString());
  }

  if (value && typeof value === 'object' && '$numberDecimal' in value) {
    return dinheiroParaCentavos((value as { $numberDecimal?: string }).$numberDecimal);
  }

  const raw = String(value ?? '0').trim();
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  return Math.round(amount * 100);
}

export function centavosParaString(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export function centavosParaDecimal128(centavos: number): Types.Decimal128 {
  return Types.Decimal128.fromString(centavosParaString(centavos));
}

export function calcularStatusTitulo(valorTotal: unknown, valorPago: unknown) {
  const total = dinheiroParaCentavos(valorTotal);
  const pago = dinheiroParaCentavos(valorPago);

  if (pago <= 0) {
    return TITULO_FINANCEIRO_STATUS.ABERTO;
  }

  if (pago >= total) {
    return TITULO_FINANCEIRO_STATUS.QUITADO;
  }

  return TITULO_FINANCEIRO_STATUS.PARCIAL;
}

export function avancarCompetencia(data: Date, frequencia: RecorrenciaFinanceiraFrequencia): Date {
  const next = new Date(data);

  if (frequencia === RECORRENCIA_FINANCEIRA_FREQUENCIA.SEMANAL) {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  if (frequencia === RECORRENCIA_FINANCEIRA_FREQUENCIA.QUINZENAL) {
    next.setUTCDate(next.getUTCDate() + 15);
    return next;
  }

  if (frequencia === RECORRENCIA_FINANCEIRA_FREQUENCIA.ANUAL) {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    const ultimoDia = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, ultimoDia));
    return next;
  }

  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const ultimoDia = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, ultimoDia));
  return next;
}

export function vencimentoDaCompetencia(competencia: Date, diaVencimento: number): Date {
  const year = competencia.getUTCFullYear();
  const month = competencia.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(diaVencimento, 1), ultimoDia);

  return new Date(Date.UTC(year, month, day));
}
