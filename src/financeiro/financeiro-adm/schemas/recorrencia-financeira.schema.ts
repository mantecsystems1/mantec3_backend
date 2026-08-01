import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { RECORRENCIA_FINANCEIRA_FREQUENCIA, RECORRENCIA_FINANCEIRA_STATUS, TITULO_FINANCEIRO_TIPO } from '../financeiro-adm.types';

export type RecorrenciaFinanceiraDocument = RecorrenciaFinanceira & Document;

@Schema({ collection: 'financeiroRecorrencias', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class RecorrenciaFinanceira {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(TITULO_FINANCEIRO_TIPO) })
  tipoTitulo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CategoriaFinanceira', required: true })
  categoriaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ContaFinanceira' })
  contaId?: Types.ObjectId;

  @Prop({ required: true })
  descricao: string;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  valor: Types.Decimal128;

  @Prop({ required: true, enum: Object.values(RECORRENCIA_FINANCEIRA_FREQUENCIA) })
  frequencia: string;

  @Prop({ required: true, min: 1, max: 31 })
  diaVencimento: number;

  @Prop({ required: true })
  inicioEm: Date;

  @Prop()
  fimEm?: Date;

  @Prop({ required: true })
  proximaCompetencia: Date;

  @Prop({ required: true, enum: Object.values(RECORRENCIA_FINANCEIRA_STATUS), default: RECORRENCIA_FINANCEIRA_STATUS.ATIVA })
  status: string;

  @Prop({ default: 'outro' })
  contraparteTipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  contraparteId?: Types.ObjectId;

  @Prop()
  documentoNumero?: string;

  @Prop()
  observacoes?: string;
}

export const RecorrenciaFinanceiraSchema = SchemaFactory.createForClass(RecorrenciaFinanceira);
