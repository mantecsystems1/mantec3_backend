import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComprasService } from './compras.service';
import { ComprasController } from './compras.controller';
import { Fornecedor, FornecedorSchema } from './schemas/fornecedor.schema';
import { PedidosCompra, PedidosCompraSchema } from './schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraSchema } from './schemas/itens-pedido-compra.schema';
import { MovimentosEstoque, MovimentosEstoqueSchema } from '../estoque/schemas/movimento-estoque.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: Fornecedor.name, schema: FornecedorSchema },
      { name: PedidosCompra.name, schema: PedidosCompraSchema },
      { name: ItensPedidoCompra.name, schema: ItensPedidoCompraSchema },
      { name: MovimentosEstoque.name, schema: MovimentosEstoqueSchema },
    ]),
  ],
  controllers: [ComprasController],
  providers: [ComprasService],
  exports: [ComprasService],
})
export class ComprasModule {}
