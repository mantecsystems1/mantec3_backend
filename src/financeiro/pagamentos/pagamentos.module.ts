import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PagamentosService } from './pagamentos.service';
import { PagamentosController } from './pagamentos.controller';
import { Pagamento, PagamentoSchema } from './schemas/pagamento.schema';
import { Venda, VendaSchema } from '../vendas/schemas/venda.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: Pagamento.name, schema: PagamentoSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
  ],
  controllers: [PagamentosController],
  providers: [PagamentosService],
  exports: [PagamentosService],
})
export class PagamentosModule {}
