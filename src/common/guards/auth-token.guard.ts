import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestWithUser {
  headers: {
    authorization?: string;
  };
  user?: {
    id: string;
    _id: string;
    sub: string;
    nome: string;
    email: string;
    empresaId: string;
    perfil?: string;
  };
}

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token nao informado.');
    }

    const token = authorization.replace('Bearer ', '');
    const payload = await this.authService.verifyToken(token);

    request.user = {
      id: payload.sub,
      _id: payload.sub,
      sub: payload.sub,
      nome: payload.nome,
      email: payload.email,
      empresaId: payload.empresaId,
      perfil: payload.perfil,
    };

    return true;
  }
}
