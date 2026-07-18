import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ItensPedidoCompraDocument = ItensPedidoCompra & Document;

@Schema({
  collection: 'itensPedidoCompra',
  timestamps: true,
})
export class ItensPedidoCompra {

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'PedidosCompra',
    required: true,
  })
  pedidoCompraId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Produto',
    required: true,
  })
  produtoId: Types.ObjectId;

  @Prop({
    required: true,
    default: 1,
  })
  quantidade: number;

  @Prop({
    type: MongooseSchema.Types.Decimal128,
    required: true,
  })
  valorUnitario: Types.Decimal128;
}

export const ItensPedidoCompraSchema =
  SchemaFactory.createForClass(ItensPedidoCompra);