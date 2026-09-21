import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { normalizarPerfil, PERFIS_SISTEMA } from '../../permissoes/matriz-permissoes';

export function isPlatformAdmin(user?: CurrentUserPayload): boolean {
  return normalizarPerfil(user?.perfil ?? '') === PERFIS_SISTEMA.ADMINISTRADOR;
}

export function tenantFilter(user?: CurrentUserPayload): Record<string, unknown> {
  if (!user?.empresaId) throw new UnauthorizedException('Empresa nao informada.');
  return isPlatformAdmin(user) ? {} : { empresaId: user.empresaId };
}

export function requirePlatformAdmin(user?: CurrentUserPayload): void {
  tenantFilter(user);
  if (!isPlatformAdmin(user)) throw new ForbiddenException('Acesso restrito ao administrador da plataforma.');
}
