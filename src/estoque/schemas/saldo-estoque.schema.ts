import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SaldoEstoqueDocument = SaldoEstoque & Document;

@Schema({ collection: 'saldosEstoque', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class SaldoEstoque {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produtoId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  saldoFisico: number;

  @Prop({ required: true, default: 0 })
  reservado: number;

  @Prop({ required: true, default: 0 })
  disponivel: number;
}

export const SaldoEstoqueSchema = SchemaFactory.createForClass(SaldoEstoque);

SaldoEstoqueSchema.index({ empresaId: 1, produtoId: 1 }, { unique: true });
