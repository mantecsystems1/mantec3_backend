import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecebimentoEquipamentoService } from './recebimento-equipamento.service';
import { RecebimentoEquipamentoController } from './recebimento-equipamento.controller';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from './recebimento-equipamento.schema';
import { CondicoesEquipamento, CondicoesEquipamentoSchema } from '../condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesSchema } from '../componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoSchema } from '../midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoSchema } from '../termos/termos-recebimento.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { RecebimentoCompletoService } from './recebimento-completo.service';
import { OrdemServico, OrdemServicoSchema } from '../../ordens-servico/schemas/ordem-servico.schema';
import { Orcamento, OrcamentoSchema } from '../../orcamentos/schemas/orcamento.schema';
import { Venda, VendaSchema } from '../../financeiro/vendas/schemas/venda.schema';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
      { name: CondicoesEquipamento.name, schema: CondicoesEquipamentoSchema },
      { name: ComponentesAusentes.name, schema: ComponentesAusentesSchema },
      { name: MidiasRecebimento.name, schema: MidiasRecebimentoSchema },
      { name: TermosRecebimento.name, schema: TermosRecebimentoSchema },
      { name: OrdemServico.name, schema: OrdemServicoSchema },
      { name: Orcamento.name, schema: OrcamentoSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
  ],
  controllers: [RecebimentoEquipamentoController],
  providers: [RecebimentoEquipamentoService, RecebimentoCompletoService],
  exports: [RecebimentoEquipamentoService],
})
export class RecebimentoEquipamentoModule {}
