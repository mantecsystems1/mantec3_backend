import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { CONTA_FINANCEIRA_TIPO } from '../financeiro-adm.types';

export type ContaFinanceiraDocument = ContaFinanceira & Document;

@Schema({ collection: 'financeiroContas', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class ContaFinanceira {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  @Prop({ required: true, enum: Object.values(CONTA_FINANCEIRA_TIPO) })
  tipo: string;

  @Prop()
  banco?: string;

  @Prop()
  agencia?: string;

  @Prop()
  numero?: string;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: Types.Decimal128.fromString('0') })
  saldoInicial: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: Types.Decimal128.fromString('0') })
  saldoAtual: Types.Decimal128;

  @Prop({ default: 'BRL' })
  moeda: string;

  @Prop({ default: true })
  ativo: boolean;

  @Prop()
  observacoes?: string;
}

export const ContaFinanceiraSchema = SchemaFactory.createForClass(ContaFinanceira);
