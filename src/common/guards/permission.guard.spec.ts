import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';

function createContext(user?: unknown, body?: Record<string, unknown>) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user, body }),
    }),
  } as never;
}

describe('PermissionGuard', () => {
  it('libera rota sem evento declarado', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('libera usuario com perfil autorizado para evento', () => {
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(EVENTOS_NEGOCIO.OS_FINALIZAR),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(guard.canActivate(createContext({ perfil: 'tecnico' }))).toBe(true);
  });

  it('bloqueia usuario sem autenticacao quando evento e exigido', () => {
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(EVENTOS_NEGOCIO.OS_FINALIZAR),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('bloqueia perfil sem permissao para evento', () => {
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(() => guard.canActivate(createContext({ perfil: 'tecnico' }))).toThrow(ForbiddenException);
  });

  it('resolve evento dinamico pelo body', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        field: 'status',
        map: {
          aprovado: EVENTOS_NEGOCIO.ORCAMENTO_APROVAR,
        },
        fallback: EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO,
      }),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(guard.canActivate(createContext({ perfil: 'gerente' }, { status: 'aprovado' }))).toBe(true);
    expect(() => guard.canActivate(createContext({ perfil: 'atendente' }, { status: 'aprovado' }))).toThrow(ForbiddenException);
  });
});
