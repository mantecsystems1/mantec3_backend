import { BadRequestException } from '@nestjs/common';
import { assertCanEditOrcamento, assertCanTransitionOrcamento } from './orcamento.transitions';
import { ORCAMENTO_STATUS } from './orcamento.states';

describe('orcamento state transitions', () => {
  it('permite enviar orcamento em rascunho', () => {
    expect(() => assertCanTransitionOrcamento(ORCAMENTO_STATUS.RASCUNHO, ORCAMENTO_STATUS.ENVIADO)).not.toThrow();
  });

  it('permite aprovar orcamento enviado', () => {
    expect(() => assertCanTransitionOrcamento(ORCAMENTO_STATUS.ENVIADO, ORCAMENTO_STATUS.APROVADO)).not.toThrow();
  });

  it('bloqueia edicao fora de rascunho', () => {
    expect(() => assertCanEditOrcamento(ORCAMENTO_STATUS.ENVIADO)).toThrow(BadRequestException);
  });

  it('bloqueia transicao depois de aprovado', () => {
    expect(() => assertCanTransitionOrcamento(ORCAMENTO_STATUS.APROVADO, ORCAMENTO_STATUS.CANCELADO)).toThrow(BadRequestException);
  });
});
