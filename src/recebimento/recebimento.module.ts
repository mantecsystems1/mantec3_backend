import { Module } from '@nestjs/common';
import { RecebimentoEquipamentoModule } from './recebimento-equipamento/recebimento-equipamento.module';
import { MidiasRecebimentoModule } from './midias/midias-recebimento.module';
import { CondicoesEquipamentoModule } from './condicoes/condicoes-equipamento.module';
import { ComponentesAusentesModule } from './componentes-ausentes/componentes-ausentes.module';
import { TermosRecebimentoModule } from './termos/termos-recebimento.module';
import { RascunhoRecebimentoModule } from './rascunhos/rascunho-recebimento.module';

@Module({
  imports: [
    RascunhoRecebimentoModule,
    RecebimentoEquipamentoModule,
    MidiasRecebimentoModule,
    CondicoesEquipamentoModule,
    ComponentesAusentesModule,
    TermosRecebimentoModule,
  ],
})
export class RecebimentoModule {}
