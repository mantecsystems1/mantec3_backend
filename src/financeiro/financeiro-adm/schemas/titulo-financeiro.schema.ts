import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { TITULO_FINANCEIRO_STATUS, TITULO_FINANCEIRO_TIPO } from '../financeiro-adm.types';

export type TituloFinanceiroDocument = TituloFinanceiro & Document;

@Schema({ collection: 'financeiroTitulos', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class TituloFinanceiro {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(TITULO_FINANCEIRO_TIPO) })
  tipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CategoriaFinanceira', required: true })
  categoriaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ContaFinanceira' })
  contaId?: Types.ObjectId;

  @Prop({ required: true })
  descricao: string;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  valorTotal: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: Types.Decimal128.fromString('0') })
  valorPago: Types.Decimal128;

  @Prop({ required: true })
  dataCompetencia: Date;

  @Prop({ required: true })
  dataVencimento: Date;

  @Prop()
  dataPagamento?: Date;

  @Prop({ required: true, enum: Object.values(TITULO_FINANCEIRO_STATUS), default: TITULO_FINANCEIRO_STATUS.ABERTO })
  status: string;

  @Prop({ default: 'outro' })
  contraparteTipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  contraparteId?: Types.ObjectId;

  @Prop()
  documentoNumero?: string;

  @Prop()
  origemTipo?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  origemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RecorrenciaFinanceira' })
  recorrenciaId?: Types.ObjectId;

  @Prop()
  observacoes?: string;
}

export const TituloFinanceiroSchema = SchemaFactory.createForClass(TituloFinanceiro);
