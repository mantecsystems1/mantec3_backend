import { Module } from '@nestjs/common';
import { VendasModule } from './vendas/vendas.module';
import { PagamentosModule } from './pagamentos/pagamentos.module';
import { FinanceiroAdmModule } from './financeiro-adm/financeiro-adm.module';

@Module({
  imports: [
    VendasModule,
    PagamentosModule,
    FinanceiroAdmModule,
  ],
})
export class FinanceiroModule {}
