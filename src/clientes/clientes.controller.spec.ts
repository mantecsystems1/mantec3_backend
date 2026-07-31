jest.mock('../common/guards/auth-token.guard', () => ({ AuthTokenGuard: class {} }));
jest.mock('../common/guards/permission.guard', () => ({ PermissionGuard: class {} }));

import { ClientesController } from './clientes.controller';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('ClientesController', () => {
  const user: CurrentUserPayload = {
    id: 'user-1',
    _id: 'user-1',
    sub: 'user-1',
    nome: 'Atendente',
    email: 'atendente@mantec.local',
    empresaId: 'empresa-1',
    perfil: 'atendente',
  };

  const createController = () => {
    const service = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    return {
      controller: new ClientesController(service as never),
      service,
    };
  };

  it('cria cliente repassando usuario autenticado para auditoria', () => {
    const { controller, service } = createController();
    const dto = {
      empresaId: '507f1f77bcf86cd799439011',
      nome: 'Cliente Teste',
      cpfCnpj: '12345678900',
    };

    controller.create(dto, user);

    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('atualiza cliente repassando usuario autenticado para auditoria', () => {
    const { controller, service } = createController();
    const dto = { telefone: '11999999999' };

    controller.update('cliente-1', dto, user);

    expect(service.update).toHaveBeenCalledWith('cliente-1', dto, 'user-1');
  });

  it('remove cliente repassando usuario autenticado para auditoria', () => {
    const { controller, service } = createController();

    controller.remove('cliente-1', user);

    expect(service.remove).toHaveBeenCalledWith('cliente-1', 'user-1');
  });
});
