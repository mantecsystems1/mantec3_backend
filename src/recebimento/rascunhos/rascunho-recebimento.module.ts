import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RascunhoRecebimento, RascunhoRecebimentoSchema } from './rascunho-recebimento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from '../recebimento-equipamento/recebimento-equipamento.schema';
import { RascunhoRecebimentoController } from './rascunho-recebimento.controller';
import { RascunhoRecebimentoService } from './rascunho-recebimento.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: RascunhoRecebimento.name, schema: RascunhoRecebimentoSchema },
    { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
  ])],
  controllers: [RascunhoRecebimentoController], providers: [RascunhoRecebimentoService],
})
export class RascunhoRecebimentoModule {}
