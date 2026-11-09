import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type OrcamentoDocument = Orcamento & Document;

@Schema({ collection: 'orcamentos', timestamps: { createdAt: 'criadoEm' } })
export class Orcamento {
  @Prop()
  numero?: string;

  @Prop({ select: false })
  operacaoId?: string;

  @Prop({ select: false })
  operacaoHash?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RecebimentoEquipamento', required: true })
  recebimentoEquipamentoId: Types.ObjectId;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  validade: Date;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  subtotal: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: 0 })
  descontos: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  total: Types.Decimal128;

  @Prop()
  observacoes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  criadoPor: Types.ObjectId;
}

export const OrcamentoSchema = SchemaFactory.createForClass(Orcamento);

OrcamentoSchema.index({ empresaId: 1, status: 1, criadoEm: -1 });
OrcamentoSchema.index({ empresaId: 1, clienteId: 1, criadoEm: -1 });
OrcamentoSchema.index({ empresaId: 1, recebimentoEquipamentoId: 1 });
OrcamentoSchema.index({ empresaId: 1, criadoPor: 1, operacaoId: 1 }, { unique: true, partialFilterExpression: { operacaoId: { $type: 'string' } } });
OrcamentoSchema.index({ empresaId: 1, numero: 1 }, { unique: true, partialFilterExpression: { numero: { $type: 'string' } } });
