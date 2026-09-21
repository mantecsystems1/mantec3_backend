import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('Revogacao de sessoes', () => {
  let user: any;
  let auth: AuthService;
  beforeEach(() => {
    user = { _id: '507f1f77bcf86cd799439011', nome: 'QA', email: 'qa@example.invalid', perfil: 'admin_empresa', ativo: true, tokenVersion: 0, senhaHash: 'scrypt:test', empresaId: { _id: '507f1f77bcf86cd799439012', ativa: true } };
    auth = new AuthService({ findByEmail: async () => user, validatePassword: async () => true, findForAuthentication: async () => user } as never, { get: () => 'test-secret-long-enough-for-security-spec' } as never);
  });
  it('aceita sessao atual', async () => {
    const { token } = await auth.login({ email: user.email, senha: 'test' });
    expect((await auth.verifyToken(token)).sub).toBe(user._id);
  });
  it.each(['deleted', 'inactive', 'company', 'role', 'version'])('revoga sessao: %s', async change => {
    const { token } = await auth.login({ email: user.email, senha: 'test' });
    if (change === 'deleted') user = null;
    if (change === 'inactive') user.ativo = false;
    if (change === 'company') user.empresaId.ativa = false;
    if (change === 'role') user.perfil = 'tecnico';
    if (change === 'version') user.tokenVersion++;
    await expect(auth.verifyToken(token)).rejects.toThrow(UnauthorizedException);
  });
  it('bloqueia login de empresa desativada', async () => {
    user.empresaId.ativa = false;
    await expect(auth.login({ email: user.email, senha: 'test' })).rejects.toThrow(UnauthorizedException);
  });
});
