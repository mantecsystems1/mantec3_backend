import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificacaoService } from './notificacao.service';
import { NotificacaoController } from './notificacao.controller';
import { Notificacao, NotificacaoSchema } from './notificacao.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([{ name: Notificacao.name, schema: NotificacaoSchema }]),
  ],
  controllers: [NotificacaoController],
  providers: [NotificacaoService],
  exports: [NotificacaoService],
})
export class NotificacaoModule {}
