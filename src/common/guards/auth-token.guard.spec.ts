jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { AuthTokenGuard } from './auth-token.guard';

type MockRequest = {
  headers: { authorization?: string };
  user?: unknown;
};

function createContext(request: MockRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

describe('AuthTokenGuard', () => {
  it('bloqueia requisicao sem token', () => {
    const guard = new AuthTokenGuard({ verifyToken: jest.fn() } as never);

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('preenche request.user com payload validado', () => {
    const request: MockRequest = {
      headers: { authorization: 'Bearer token-valido' },
    };
    const guard = new AuthTokenGuard({
      verifyToken: jest.fn().mockReturnValue({
        sub: '507f1f77bcf86cd799439011',
        nome: 'Tecnico',
        email: 'tecnico@mantec.local',
        empresaId: '507f1f77bcf86cd799439012',
        perfil: 'tecnico',
      }),
    } as never);

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(request.user).toEqual({
      id: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      sub: '507f1f77bcf86cd799439011',
      nome: 'Tecnico',
      email: 'tecnico@mantec.local',
      empresaId: '507f1f77bcf86cd799439012',
      perfil: 'tecnico',
    });
  });
});
