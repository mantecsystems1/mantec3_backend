import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecebimentoEquipamentoService } from './recebimento-equipamento.service';
import { RecebimentoEquipamentoController } from './recebimento-equipamento.controller';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from './recebimento-equipamento.schema';
import { CondicoesEquipamento, CondicoesEquipamentoSchema } from '../condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesSchema } from '../componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoSchema } from '../midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoSchema } from '../termos/termos-recebimento.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
      { name: CondicoesEquipamento.name, schema: CondicoesEquipamentoSchema },
      { name: ComponentesAusentes.name, schema: ComponentesAusentesSchema },
      { name: MidiasRecebimento.name, schema: MidiasRecebimentoSchema },
      { name: TermosRecebimento.name, schema: TermosRecebimentoSchema },
    ]),
  ],
  controllers: [RecebimentoEquipamentoController],
  providers: [RecebimentoEquipamentoService],
  exports: [RecebimentoEquipamentoService],
})
export class RecebimentoEquipamentoModule {}
