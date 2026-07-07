import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ItensPedidoCompraDocument = ItensPedidoCompra & Document;

@Schema({ collection: 'itensPedidoCompra' })
export class ItensPedidoCompra {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PedidosCompra', required: true })
  pedidoCompraId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produtoId: Types.ObjectId;

  @Prop({ required: true })
  quantidade: number;

  // Accept Mixed so controller/service can accept string/number/Decimal128 and convert as needed
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  valorUnitario: any;
}

export const ItensPedidoCompraSchema = SchemaFactory.createForClass(ItensPedidoCompra);