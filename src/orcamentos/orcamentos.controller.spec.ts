jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { OrcamentosController } from './orcamentos.controller';
import { ORCAMENTO_STATUS } from './state/orcamento.states';

describe('OrcamentosController', () => {
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

    controller.enviar('orc-1');

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.ENVIADO });
  });

  it('aprova orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.aprovar('orc-1');

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.APROVADO });
  });

  it('reprova orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.reprovar('orc-1');

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.REPROVADO });
  });

  it('cancela orcamento usando status explicito', () => {
    const { controller, service } = createController();

    controller.cancelar('orc-1');

    expect(service.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.CANCELADO });
  });

  it('gera OS a partir do orcamento aprovado', () => {
    const { controller, service } = createController();
    const user = { id: 'user-1', _id: 'user-1', sub: 'user-1', nome: 'User', email: 'u@test.com', empresaId: 'emp-1' };

    controller.gerarOrdemServico('orc-1', user);

    expect(service.gerarOrdemServico).toHaveBeenCalledWith('orc-1', user);
  });
});
