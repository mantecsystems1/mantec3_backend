jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { OsController } from './os.controller';
import { OS_STATUS } from './state/os.states';

describe('OsController', () => {
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

    controller.iniciarDiagnostico('os-1');

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_DIAGNOSTICO });
  });

  it('aguarda peca usando status explicito', () => {
    const { controller, service } = createController();

    controller.aguardarPeca('os-1');

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.AGUARDANDO_PECA });
  });

  it('inicia execucao usando status explicito', () => {
    const { controller, service } = createController();

    controller.iniciarExecucao('os-1');

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_EXECUCAO });
  });

  it('finaliza usando status explicito', () => {
    const { controller, service } = createController();

    controller.finalizar('os-1');

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.CONCLUIDA });
  });

  it('cancela usando status explicito', () => {
    const { controller, service } = createController();

    controller.cancelar('os-1');

    expect(service.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.CANCELADA });
  });

  it('encaminha reserva de peca ao service', () => {
    const { controller, service } = createController();
    const dto = { ordemServicoId: 'os-1', produtoId: 'prod-1', quantidade: 2 };

    controller.createReserva(dto);

    expect(service.reservarPeca).toHaveBeenCalledWith(dto);
  });

  it('encaminha consumo de reserva ao service', () => {
    const { controller, service } = createController();

    controller.consumirReserva('reserva-1');

    expect(service.consumirReserva).toHaveBeenCalledWith('reserva-1');
  });

  it('encaminha remocao de reserva ao service', () => {
    const { controller, service } = createController();

    controller.removeReserva('reserva-1');

    expect(service.removerReserva).toHaveBeenCalledWith('reserva-1');
  });
});
