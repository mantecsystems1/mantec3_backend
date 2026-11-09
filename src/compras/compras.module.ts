import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComprasService } from './compras.service';
import { ComprasController } from './compras.controller';
import { Fornecedor, FornecedorSchema } from './schemas/fornecedor.schema';
import { PedidosCompra, PedidosCompraSchema } from './schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraSchema } from './schemas/itens-pedido-compra.schema';
import { EstoqueModule } from '../estoque/estoque.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { FinanceiroAdmModule } from '../financeiro/financeiro-adm/financeiro-adm.module';

@Module({
  imports: [
    AuditoriaModule,
    FinanceiroAdmModule,
    EstoqueModule,
    MongooseModule.forFeature([
      { name: Fornecedor.name, schema: FornecedorSchema },
      { name: PedidosCompra.name, schema: PedidosCompraSchema },
      { name: ItensPedidoCompra.name, schema: ItensPedidoCompraSchema },
    ]),
  ],
  controllers: [ComprasController],
  providers: [ComprasService],
  exports: [ComprasService],
})
export class ComprasModule {}
