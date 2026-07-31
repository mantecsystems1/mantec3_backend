export const OS_STATUS = {
  ABERTA: 'aberta',
  EM_DIAGNOSTICO: 'em_diagnostico',
  AGUARDANDO_PECA: 'aguardando_peca',
  EM_EXECUCAO: 'em_execucao',
  CONCLUIDA: 'concluida',
  CANCELADA: 'cancelada',
} as const;

export type OsStatus = (typeof OS_STATUS)[keyof typeof OS_STATUS];

export const OS_STATUS_TERMINAIS: ReadonlySet<OsStatus> = new Set([
  OS_STATUS.CONCLUIDA,
  OS_STATUS.CANCELADA,
]);

export function isOsStatus(status: string): status is OsStatus {
  return Object.values(OS_STATUS).includes(status as OsStatus);
}
