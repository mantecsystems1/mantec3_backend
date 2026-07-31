jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { OrcamentosController } from './orcamentos.controller';
import { ORCAMENTO_STATUS } from './state/orcamento.states';

describe('OrcamentosController', () => {
  const createController = () => {
    const service = {
      update: jest.fn(),
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
});
