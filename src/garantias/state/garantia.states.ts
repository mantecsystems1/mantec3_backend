export const GARANTIA_STATUS = {
  ABERTA: 'aberta',
  ENVIADA_FORNECEDOR: 'enviada_fornecedor',
  EM_ANALISE: 'em_analise',
  APROVADA: 'aprovada',
  RECUSADA: 'recusada',
  CONCLUIDA: 'concluida',
} as const;

export type GarantiaStatus = (typeof GARANTIA_STATUS)[keyof typeof GARANTIA_STATUS];

export const GARANTIA_STATUS_TERMINAIS: ReadonlySet<GarantiaStatus> = new Set([
  GARANTIA_STATUS.CONCLUIDA,
]);

export function isGarantiaStatus(status: string): status is GarantiaStatus {
  return Object.values(GARANTIA_STATUS).includes(status as GarantiaStatus);
}
