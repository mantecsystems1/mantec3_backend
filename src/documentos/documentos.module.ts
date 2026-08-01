import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from '../clientes/schemas/cliente.schema';
import { Empresa, EmpresaSchema } from '../core/empresa/schemas/empresa.schema';
import { Pagamento, PagamentoSchema } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { ItensVenda, ItensVendaSchema } from '../financeiro/vendas/schemas/itens-venda.schema';
import { Venda, VendaSchema } from '../financeiro/vendas/schemas/venda.schema';
import { ItensOrcamento, ItensOrcamentoSchema } from '../orcamentos/schemas/itens-orcamento.schema';
import { Orcamento, OrcamentoSchema } from '../orcamentos/schemas/orcamento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from '../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { TermosRecebimento, TermosRecebimentoSchema } from '../recebimento/termos/termos-recebimento.schema';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Empresa.name, schema: EmpresaSchema },
      { name: Cliente.name, schema: ClienteSchema },
      { name: Orcamento.name, schema: OrcamentoSchema },
      { name: ItensOrcamento.name, schema: ItensOrcamentoSchema },
      { name: Venda.name, schema: VendaSchema },
      { name: ItensVenda.name, schema: ItensVendaSchema },
      { name: Pagamento.name, schema: PagamentoSchema },
      { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
      { name: TermosRecebimento.name, schema: TermosRecebimentoSchema },
    ]),
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService],
  exports: [DocumentosService],
})
export class DocumentosModule {}
