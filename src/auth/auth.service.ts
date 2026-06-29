import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';

type TokenPayload = {
  sub: string;
  nome: string;
  email: string;
  empresaId: string;
  empresaNome?: string;
  perfil?: string;
  exp: number;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const usuario = await this.usuariosService.findByEmail(loginDto.email);

    if (!usuario || !(await this.usuariosService.validatePassword(usuario, loginDto.senha))) {
      throw new UnauthorizedException('E-mail ou senha invalidos');
    }

    if (!String(usuario.senhaHash).startsWith('scrypt:')) {
      usuario.senhaHash = await this.usuariosService.hashPassword(loginDto.senha);
      await usuario.save();
    }

    const empresa = usuario.empresaId as any;
    const payload: TokenPayload = {
      sub: String(usuario._id),
      nome: usuario.nome,
      email: usuario.email,
      empresaId: String(empresa?._id ?? usuario.empresaId),
      empresaNome: empresa?.nomeFantasia ?? empresa?.razaoSocial,
      perfil: (usuario as any).perfil,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };

    return {
      token: this.sign(payload),
      user: {
        id: payload.sub,
        nome: payload.nome,
        email: payload.email,
        empresaId: payload.empresaId,
        empresaNome: payload.empresaNome,
        perfil: payload.perfil,
      },
    };
  }

  verifyToken(token: string) {
    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Token invalido');
    }

    const expectedSignature = this.createSignature(encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Token invalido');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as TokenPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Sessao expirada');
    }

    return payload;
  }

  private sign(payload: TokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${this.createSignature(encodedPayload)}`;
  }

  private createSignature(encodedPayload: string) {
    return createHmac('sha256', this.getSecret())
      .update(encodedPayload)
      .digest('base64url');
  }

  private getSecret() {
    return (
      this.configService.get<string>('AUTH_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'mantec-local-dev-secret'
    );
  }
}
