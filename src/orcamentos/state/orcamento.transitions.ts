import { BadRequestException } from '@nestjs/common';
import { ORCAMENTO_STATUS, ORCAMENTO_STATUS_TERMINAIS, OrcamentoStatus, isOrcamentoStatus } from './orcamento.states';

export const ORCAMENTO_TRANSITIONS: Record<OrcamentoStatus, ReadonlySet<OrcamentoStatus>> = {
  [ORCAMENTO_STATUS.RASCUNHO]: new Set([
    ORCAMENTO_STATUS.ENVIADO,
    ORCAMENTO_STATUS.CANCELADO,
  ]),
  [ORCAMENTO_STATUS.ENVIADO]: new Set([
    ORCAMENTO_STATUS.APROVADO,
    ORCAMENTO_STATUS.REJEITADO,
    ORCAMENTO_STATUS.REPROVADO,
    ORCAMENTO_STATUS.EXPIRADO,
    ORCAMENTO_STATUS.CANCELADO,
  ]),
  [ORCAMENTO_STATUS.APROVADO]: new Set(),
  [ORCAMENTO_STATUS.REJEITADO]: new Set(),
  [ORCAMENTO_STATUS.REPROVADO]: new Set(),
  [ORCAMENTO_STATUS.CANCELADO]: new Set(),
  [ORCAMENTO_STATUS.EXPIRADO]: new Set(),
};

export function assertCanTransitionOrcamento(currentStatus: string, nextStatus: string): void {
  if (!isOrcamentoStatus(currentStatus)) {
    throw new BadRequestException(`Status atual de orcamento invalido: ${currentStatus}`);
  }

  if (!isOrcamentoStatus(nextStatus)) {
    throw new BadRequestException(`Novo status de orcamento invalido: ${nextStatus}`);
  }

  if (currentStatus === nextStatus) {
    return;
  }

  if (ORCAMENTO_STATUS_TERMINAIS.has(currentStatus)) {
    throw new BadRequestException(`Orcamento em status ${currentStatus} nao pode mudar de status.`);
  }

  if (!ORCAMENTO_TRANSITIONS[currentStatus].has(nextStatus)) {
    throw new BadRequestException(`Transicao de orcamento nao permitida: ${currentStatus} -> ${nextStatus}`);
  }
}

export function assertCanEditOrcamento(status: string): void {
  if (!isOrcamentoStatus(status)) {
    throw new BadRequestException(`Status de orcamento invalido: ${status}`);
  }

  if (status !== ORCAMENTO_STATUS.RASCUNHO) {
    throw new BadRequestException('Apenas orcamento em rascunho pode ser editado.');
  }
}
