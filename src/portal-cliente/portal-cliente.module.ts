import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from '../clientes/schemas/cliente.schema';
import { Produto, ProdutoSchema } from '../catalogo/produtos/schemas/produto.schema';
import { Servico, ServicoSchema } from '../catalogo/servicos/schemas/servico.schema';
import { Empresa, EmpresaSchema } from '../core/empresa/schemas/empresa.schema';
import { Pagamento, PagamentoSchema } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { Venda, VendaSchema } from '../financeiro/vendas/schemas/venda.schema';
import { Garantia, GarantiaSchema } from '../garantias/schemas/garantia.schema';
import { DocumentosModule } from '../documentos/documentos.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { LogEvento, LogEventoSchema } from '../auditoria/schemas/log-evento.schema';
import { Orcamento, OrcamentoSchema } from '../orcamentos/schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoSchema } from '../orcamentos/schemas/itens-orcamento.schema';
import { OrdemServico, OrdemServicoSchema } from '../ordens-servico/schemas/ordem-servico.schema';
import { PortalClienteController } from './portal-cliente.controller';
import { PortalClienteService } from './portal-cliente.service';

@Module({
  imports: [
    ConfigModule,
    OrcamentosModule,
    DocumentosModule,
    MongooseModule.forFeature([
      { name: Cliente.name, schema: ClienteSchema },
      { name: Empresa.name, schema: EmpresaSchema },
      { name: Orcamento.name, schema: OrcamentoSchema },
      { name: ItensOrcamento.name, schema: ItensOrcamentoSchema },
      { name: OrdemServico.name, schema: OrdemServicoSchema },
      { name: Venda.name, schema: VendaSchema },
      { name: Pagamento.name, schema: PagamentoSchema },
      { name: Garantia.name, schema: GarantiaSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: Servico.name, schema: ServicoSchema },
      { name: LogEvento.name, schema: LogEventoSchema },
    ]),
  ],
  controllers: [PortalClienteController],
  providers: [PortalClienteService],
})
export class PortalClienteModule {}
