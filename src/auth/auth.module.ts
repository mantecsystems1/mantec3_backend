import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase/firebase.service';
import { FirebaseAuthGuard } from './firebase/firebase.guard';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [FirebaseService, FirebaseAuthGuard, AuthService],
  exports: [FirebaseService, FirebaseAuthGuard, AuthService],
})
export class AuthModule {}
