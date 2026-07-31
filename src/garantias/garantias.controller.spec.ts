jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { GarantiasController } from './garantias.controller';
import { GARANTIA_STATUS } from './state/garantia.states';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('GarantiasController', () => {
  const user: CurrentUserPayload = {
    id: 'user-1',
    _id: 'user-1',
    sub: 'user-1',
    nome: 'Tecnico',
    email: 'tecnico@mantec.local',
    empresaId: 'empresa-1',
    perfil: 'tecnico',
  };

  const createController = () => {
    const service = {
      updateGarantia: jest.fn(),
    };

    return {
      controller: new GarantiasController(service as never),
      service,
    };
  };

  it('envia garantia ao fornecedor usando status explicito e usuario autenticado', () => {
    const { controller, service } = createController();

    controller.enviarFornecedor('gar-1', user);

    expect(service.updateGarantia).toHaveBeenCalledWith(
      'gar-1',
      { status: GARANTIA_STATUS.ENVIADA_FORNECEDOR },
      'user-1',
    );
  });

  it('inicia analise usando status explicito', () => {
    const { controller, service } = createController();

    controller.iniciarAnalise('gar-1', user);

    expect(service.updateGarantia).toHaveBeenCalledWith('gar-1', { status: GARANTIA_STATUS.EM_ANALISE }, 'user-1');
  });

  it('aprova garantia usando status explicito', () => {
    const { controller, service } = createController();

    controller.aprovar('gar-1', user);

    expect(service.updateGarantia).toHaveBeenCalledWith('gar-1', { status: GARANTIA_STATUS.APROVADA }, 'user-1');
  });

  it('recusa garantia usando status explicito', () => {
    const { controller, service } = createController();

    controller.recusar('gar-1', user);

    expect(service.updateGarantia).toHaveBeenCalledWith('gar-1', { status: GARANTIA_STATUS.RECUSADA }, 'user-1');
  });

  it('finaliza garantia usando status explicito', () => {
    const { controller, service } = createController();

    controller.finalizar('gar-1', user);

    expect(service.updateGarantia).toHaveBeenCalledWith('gar-1', { status: GARANTIA_STATUS.CONCLUIDA }, 'user-1');
  });
});
