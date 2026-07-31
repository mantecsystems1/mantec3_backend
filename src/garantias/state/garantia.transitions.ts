import { BadRequestException } from '@nestjs/common';
import { GARANTIA_STATUS, GARANTIA_STATUS_TERMINAIS, GarantiaStatus, isGarantiaStatus } from './garantia.states';

export const GARANTIA_TRANSITIONS: Record<GarantiaStatus, ReadonlySet<GarantiaStatus>> = {
  [GARANTIA_STATUS.ABERTA]: new Set([
    GARANTIA_STATUS.ENVIADA_FORNECEDOR,
    GARANTIA_STATUS.EM_ANALISE,
    GARANTIA_STATUS.APROVADA,
    GARANTIA_STATUS.RECUSADA,
  ]),
  [GARANTIA_STATUS.ENVIADA_FORNECEDOR]: new Set([
    GARANTIA_STATUS.EM_ANALISE,
  ]),
  [GARANTIA_STATUS.EM_ANALISE]: new Set([
    GARANTIA_STATUS.APROVADA,
    GARANTIA_STATUS.RECUSADA,
  ]),
  [GARANTIA_STATUS.APROVADA]: new Set([
    GARANTIA_STATUS.CONCLUIDA,
  ]),
  [GARANTIA_STATUS.RECUSADA]: new Set([
    GARANTIA_STATUS.CONCLUIDA,
  ]),
  [GARANTIA_STATUS.CONCLUIDA]: new Set(),
};

export function assertCanTransitionGarantia(currentStatus: string, nextStatus: string): void {
  if (!isGarantiaStatus(currentStatus)) {
    throw new BadRequestException(`Status atual de garantia invalido: ${currentStatus}`);
  }

  if (!isGarantiaStatus(nextStatus)) {
    throw new BadRequestException(`Novo status de garantia invalido: ${nextStatus}`);
  }

  if (currentStatus === nextStatus) {
    return;
  }

  if (GARANTIA_STATUS_TERMINAIS.has(currentStatus)) {
    throw new BadRequestException(`Garantia em status ${currentStatus} nao pode mudar de status.`);
  }

  if (!GARANTIA_TRANSITIONS[currentStatus].has(nextStatus)) {
    throw new BadRequestException(`Transicao de garantia nao permitida: ${currentStatus} -> ${nextStatus}`);
  }
}

export function assertCanEditGarantia(status: string): void {
  if (!isGarantiaStatus(status)) {
    throw new BadRequestException(`Status de garantia invalido: ${status}`);
  }

  if (GARANTIA_STATUS_TERMINAIS.has(status)) {
    throw new BadRequestException(`Garantia em status ${status} nao pode ser editada.`);
  }
}
