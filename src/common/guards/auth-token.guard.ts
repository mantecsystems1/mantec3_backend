import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';

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
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token nao informado.');
    }

    const token = authorization.replace('Bearer ', '');
    const payload = this.authService.verifyToken(token);

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
