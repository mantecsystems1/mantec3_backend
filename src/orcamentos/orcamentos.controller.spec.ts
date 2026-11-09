jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { OrcamentosController } from './orcamentos.controller';
import { ORCAMENTO_STATUS } from './state/orcamento.states';

describe('OrcamentosController', () => {
  const user = { id: 'user-1', _id: 'user-1', sub: 'user-1', nome: 'User', email: 'u@test.com', empresaId: 'emp-1' };

  const createController = () => {
    const service = {
      update: jest.fn(),
      gerarOrdemServico: jest.fn(),
    };

    return {
      controller: new OrcamentosController(service as never),
      service,
    };
  };

  it('envia orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.enviar('orc-1', user);

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.ENVIADO }, 'emp-1', user);
  });

  it('aprova orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.aprovar('orc-1', user);

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.APROVADO }, 'emp-1', user);
  });

  it('reprova orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.reprovar('orc-1', user);

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.REPROVADO }, 'emp-1', user);
  });

  it('cancela orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.cancelar('orc-1', user);

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.CANCELADO }, 'emp-1', user);
  });

  it('gera OS a partir do orcamento aprovado', () => {
    const { controller, service } = createController();
    controller.gerarOrdemServico('orc-1', user);

    expect(service.gerarOrdemServico).toHaveBeenCalledWith('orc-1', user);
  });
});
