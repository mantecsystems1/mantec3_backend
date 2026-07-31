import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase/firebase.service';
import { FirebaseAuthGuard } from './firebase/firebase.guard';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';

@Global()
@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [FirebaseService, FirebaseAuthGuard, AuthService, AuthTokenGuard],
  exports: [FirebaseService, FirebaseAuthGuard, AuthService, AuthTokenGuard],
})
export class AuthModule {}
