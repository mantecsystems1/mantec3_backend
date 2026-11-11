import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type VendaDocument = Venda & Document;

@Schema({ collection: 'vendas', timestamps: { createdAt: 'criadoEm' } })
export class Venda {
  @Prop()
  numero?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ required: true })
  origemTipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  origemId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  subtotal: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: 0 })
  descontos: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  total: Types.Decimal128;

  @Prop({ required: true })
  statusFinanceiro: string;
}

export const VendaSchema = SchemaFactory.createForClass(Venda);

VendaSchema.index({ empresaId: 1, statusFinanceiro: 1, criadoEm: -1 });
VendaSchema.index({ empresaId: 1, clienteId: 1, criadoEm: -1 });
VendaSchema.index({ empresaId: 1, origemTipo: 1, origemId: 1 });
