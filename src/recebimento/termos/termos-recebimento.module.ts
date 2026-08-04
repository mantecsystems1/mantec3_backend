import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TermosRecebimentoService } from './termos-recebimento.service';
import { TermosRecebimentoController } from './termos-recebimento.controller';
import { TermosRecebimento, TermosRecebimentoSchema } from './termos-recebimento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from '../recebimento-equipamento/recebimento-equipamento.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: TermosRecebimento.name, schema: TermosRecebimentoSchema },
      { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
    ]),
  ],
  controllers: [TermosRecebimentoController],
  providers: [TermosRecebimentoService],
  exports: [TermosRecebimentoService],
})
export class TermosRecebimentoModule {}
