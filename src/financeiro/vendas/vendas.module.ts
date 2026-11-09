import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VendasService } from './vendas.service';
import { VendasController } from './vendas.controller';
import { Venda, VendaSchema } from './schemas/venda.schema';
import { OperacaoVenda, OperacaoVendaSchema } from './schemas/operacao-venda.schema';
import { ItensVenda, ItensVendaSchema } from './schemas/itens-venda.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { FinanceiroAdmModule } from '../financeiro-adm/financeiro-adm.module';

@Module({
  imports: [
    AuditoriaModule,
    FinanceiroAdmModule,
    MongooseModule.forFeature([
      { name: Venda.name, schema: VendaSchema },
      { name: OperacaoVenda.name, schema: OperacaoVendaSchema },
      { name: ItensVenda.name, schema: ItensVendaSchema },
    ]),
  ],
  controllers: [VendasController],
  providers: [VendasService],
  exports: [VendasService],
})
export class VendasModule {}
