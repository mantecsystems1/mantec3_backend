import { Module } from '@nestjs/common';
import { NotificacaoModule } from './notificacoes/notificacao.module';
import { ConsultaImeiModule } from './consultas-imei/consulta-imei.module';
import { TemplateComunicacaoModule } from './templates/template-comunicacao.module';

@Module({
  imports: [NotificacaoModule, ConsultaImeiModule, TemplateComunicacaoModule],
})
export class ComunicacaoModule {}
