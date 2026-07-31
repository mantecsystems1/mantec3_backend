export const ORCAMENTO_STATUS = {
  RASCUNHO: 'rascunho',
  ENVIADO: 'enviado',
  APROVADO: 'aprovado',
  REJEITADO: 'rejeitado',
  REPROVADO: 'reprovado',
  CANCELADO: 'cancelado',
  EXPIRADO: 'expirado',
} as const;

export type OrcamentoStatus = (typeof ORCAMENTO_STATUS)[keyof typeof ORCAMENTO_STATUS];

export const ORCAMENTO_STATUS_TERMINAIS: ReadonlySet<OrcamentoStatus> = new Set([
  ORCAMENTO_STATUS.APROVADO,
  ORCAMENTO_STATUS.REJEITADO,
  ORCAMENTO_STATUS.REPROVADO,
  ORCAMENTO_STATUS.CANCELADO,
  ORCAMENTO_STATUS.EXPIRADO,
]);

export function isOrcamentoStatus(status: string): status is OrcamentoStatus {
  return Object.values(ORCAMENTO_STATUS).includes(status as OrcamentoStatus);
}
