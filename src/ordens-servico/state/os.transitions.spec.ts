import { BadRequestException } from '@nestjs/common';
import { assertCanEditOs, assertCanTransitionOs } from './os.transitions';
import { OS_STATUS } from './os.states';

describe('ordem de servico state transitions', () => {
  it('permite iniciar diagnostico de OS aberta', () => {
    expect(() => assertCanTransitionOs(OS_STATUS.ABERTA, OS_STATUS.EM_DIAGNOSTICO)).not.toThrow();
  });

  it('permite concluir OS em execucao', () => {
    expect(() => assertCanTransitionOs(OS_STATUS.EM_EXECUCAO, OS_STATUS.CONCLUIDA)).not.toThrow();
  });

  it('bloqueia pular de aberta para concluida', () => {
    expect(() => assertCanTransitionOs(OS_STATUS.ABERTA, OS_STATUS.CONCLUIDA)).toThrow(BadRequestException);
  });

  it('bloqueia edicao de OS concluida', () => {
    expect(() => assertCanEditOs(OS_STATUS.CONCLUIDA)).toThrow(BadRequestException);
  });
});
