import { Module, Global } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';

@Global()
@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenGuard],
  exports: [AuthService, AuthTokenGuard],
})
export class AuthModule {}
