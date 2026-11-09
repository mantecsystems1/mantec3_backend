jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { OsController } from './os.controller';
import { OS_STATUS } from './state/os.states';

describe('OsController', () => {
  const user = { id: 'user-1', _id: 'user-1', sub: 'user-1', nome: 'User', email: 'u@test.com', empresaId: 'emp-1' };

  const createController = () => {
    const service = {
      update: jest.fn(),
      reservarPeca: jest.fn(),
      consumirReserva: jest.fn(),
      removerReserva: jest.fn(),
    };

    return {
      controller: new OsController(service as never),
      service,
    };
  };

  it('inicia diagnostico usando status explicito', () => {
    const { controller, service } = createController();

    controller.iniciarDiagnostico('os-1', user);

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_DIAGNOSTICO }, 'emp-1', user);
  });

  it('aguarda peca usando status explicito', () => {
    const { controller, service } = createController();

    controller.aguardarPeca('os-1', user);

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.AGUARDANDO_PECA }, 'emp-1', user);
  });

  it('inicia execucao usando status explicito', () => {
    const { controller, service } = createController();

    controller.iniciarExecucao('os-1', user);

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_EXECUCAO }, 'emp-1', user);
  });

  it('finaliza usando status explicito', () => {
    const { controller, service } = createController();

    controller.finalizar('os-1', user);

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.CONCLUIDA }, 'emp-1', user);
  });

  it('cancela usando status explicito', () => {
    const { controller, service } = createController();

    controller.cancelar('os-1', user);

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.CANCELADA }, 'emp-1', user);
  });

  it('encaminha reserva de peca ao service', () => {
    const { controller, service } = createController();
    const dto = { ordemServicoId: 'os-1', produtoId: 'prod-1', quantidade: 2 };

    controller.createReserva(dto, user);

    expect(service.reservarPeca).toHaveBeenCalledWith(dto, 'emp-1', user);
  });

  it('encaminha consumo de reserva ao service', () => {
    const { controller, service } = createController();

    controller.consumirReserva('reserva-1', user);

    expect(service.consumirReserva).toHaveBeenCalledWith('reserva-1', 'emp-1', user);
  });

  it('encaminha remocao de reserva ao service', () => {
    const { controller, service } = createController();

    controller.removeReserva('reserva-1', user);

    expect(service.removerReserva).toHaveBeenCalledWith('reserva-1', 'emp-1', user);
  });
});
