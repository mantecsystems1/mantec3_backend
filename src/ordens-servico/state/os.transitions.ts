import { BadRequestException } from '@nestjs/common';
import { OS_STATUS, OS_STATUS_TERMINAIS, OsStatus, isOsStatus } from './os.states';

export const OS_TRANSITIONS: Record<OsStatus, ReadonlySet<OsStatus>> = {
  [OS_STATUS.ABERTA]: new Set([
    OS_STATUS.EM_DIAGNOSTICO,
    OS_STATUS.CANCELADA,
  ]),
  [OS_STATUS.EM_DIAGNOSTICO]: new Set([
    OS_STATUS.AGUARDANDO_PECA,
    OS_STATUS.EM_EXECUCAO,
    OS_STATUS.CANCELADA,
  ]),
  [OS_STATUS.AGUARDANDO_PECA]: new Set([
    OS_STATUS.EM_EXECUCAO,
    OS_STATUS.CANCELADA,
  ]),
  [OS_STATUS.EM_EXECUCAO]: new Set([
    OS_STATUS.CONCLUIDA,
    OS_STATUS.CANCELADA,
  ]),
  [OS_STATUS.CONCLUIDA]: new Set(),
  [OS_STATUS.CANCELADA]: new Set(),
};

export function assertCanTransitionOs(currentStatus: string, nextStatus: string): void {
  if (!isOsStatus(currentStatus)) {
    throw new BadRequestException(`Status atual de OS invalido: ${currentStatus}`);
  }

  if (!isOsStatus(nextStatus)) {
    throw new BadRequestException(`Novo status de OS invalido: ${nextStatus}`);
  }

  if (currentStatus === nextStatus) {
    return;
  }

  if (OS_STATUS_TERMINAIS.has(currentStatus)) {
    throw new BadRequestException(`OS em status ${currentStatus} nao pode mudar de status.`);
  }

  if (!OS_TRANSITIONS[currentStatus].has(nextStatus)) {
    throw new BadRequestException(`Transicao de OS nao permitida: ${currentStatus} -> ${nextStatus}`);
  }
}

export function assertCanEditOs(status: string): void {
  if (!isOsStatus(status)) {
    throw new BadRequestException(`Status de OS invalido: ${status}`);
  }

  if (OS_STATUS_TERMINAIS.has(status)) {
    throw new BadRequestException(`OS em status ${status} nao pode ser editada.`);
  }
}
