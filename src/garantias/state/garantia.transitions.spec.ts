import { BadRequestException } from '@nestjs/common';
import { assertCanEditGarantia, assertCanTransitionGarantia } from './garantia.transitions';
import { GARANTIA_STATUS } from './garantia.states';

describe('garantia state transitions', () => {
  it('permite aprovar garantia aberta', () => {
    expect(() => assertCanTransitionGarantia(GARANTIA_STATUS.ABERTA, GARANTIA_STATUS.APROVADA)).not.toThrow();
  });

  it('permite concluir garantia aprovada', () => {
    expect(() => assertCanTransitionGarantia(GARANTIA_STATUS.APROVADA, GARANTIA_STATUS.CONCLUIDA)).not.toThrow();
  });

  it('bloqueia pular de aberta para concluida', () => {
    expect(() => assertCanTransitionGarantia(GARANTIA_STATUS.ABERTA, GARANTIA_STATUS.CONCLUIDA)).toThrow(BadRequestException);
  });

  it('bloqueia edicao de garantia concluida', () => {
    expect(() => assertCanEditGarantia(GARANTIA_STATUS.CONCLUIDA)).toThrow(BadRequestException);
  });
});
