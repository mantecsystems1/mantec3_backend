import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GarantiasService } from './garantias.service';
import { GarantiasController } from './garantias.controller';
import { Garantia, GarantiaSchema } from './schemas/garantia.schema';
import { EnvioGarantia, EnvioGarantiaSchema } from './schemas/envio-garantia.schema';
import { RetornoGarantia, RetornoGarantiaSchema } from './schemas/retorno-garantia.schema';
import { CreditoFornecedor, CreditoFornecedorSchema } from './schemas/credito-fornecedor.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PedidosCompra, PedidosCompraSchema } from '../compras/schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraSchema } from '../compras/schemas/itens-pedido-compra.schema';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: Garantia.name, schema: GarantiaSchema },
      { name: EnvioGarantia.name, schema: EnvioGarantiaSchema },
      { name: RetornoGarantia.name, schema: RetornoGarantiaSchema },
      { name: CreditoFornecedor.name, schema: CreditoFornecedorSchema },
      { name: PedidosCompra.name, schema: PedidosCompraSchema },
      { name: ItensPedidoCompra.name, schema: ItensPedidoCompraSchema },
    ]),
  ],
  controllers: [GarantiasController],
  providers: [GarantiasService],
  exports: [GarantiasService],
})
export class GarantiasModule {}
