import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_EVENTO_FROM_BODY_KEY,
  REQUIRED_EVENTO_KEY,
  RequiredEventoFromBodyConfig,
} from '../decorators/require-evento.decorator';
import { EventoNegocio, perfilPodeExecutarEvento } from '../../permissoes/matriz-permissoes';

interface RequestWithUser {
  body?: Record<string, unknown>;
  user?: {
    perfil?: string;
    role?: string;
    perfis?: string[];
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const requiredEvento = this.resolveRequiredEvento(context, request);

    if (!requiredEvento) {
      return true;
    }

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario nao autenticado.');
    }

    const perfis = [
      user.perfil,
      user.role,
      ...(Array.isArray(user.perfis) ? user.perfis : []),
    ].filter((perfil): perfil is string => Boolean(perfil));

    const allowed = perfis.some((perfil) => perfilPodeExecutarEvento(perfil, requiredEvento));
    if (!allowed) {
      throw new ForbiddenException('Seu perfil nao possui permissao para executar esta acao.');
    }

    return true;
  }

  private resolveRequiredEvento(context: ExecutionContext, request: RequestWithUser) {
    const dynamicConfig = this.reflector.getAllAndOverride<RequiredEventoFromBodyConfig | undefined>(
      REQUIRED_EVENTO_FROM_BODY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (dynamicConfig) {
      const value = request.body?.[dynamicConfig.field];
      return typeof value === 'string'
        ? dynamicConfig.map[value] ?? dynamicConfig.fallback
        : dynamicConfig.fallback;
    }

    return this.reflector.getAllAndOverride<EventoNegocio | undefined>(REQUIRED_EVENTO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
