import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PedidosCompraDocument = PedidosCompra & Document;

@Schema({
  collection: 'pedidosCompra',
  timestamps: {
    createdAt: 'criadoEm',
    updatedAt: 'updatedAt',
  },
})

export class PedidosCompra {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Fornecedor', required: true })
  fornecedorId: Types.ObjectId;

  @Prop({ required: true })
  status: string;

  @Prop()
  observacoes: string;
}

export const PedidosCompraSchema = SchemaFactory.createForClass(PedidosCompra);