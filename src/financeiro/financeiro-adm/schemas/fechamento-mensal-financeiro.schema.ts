import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FechamentoMensalFinanceiroDocument = FechamentoMensalFinanceiro & Document;

export const FECHAMENTO_MENSAL_STATUS = {
  EM_CONFERENCIA: 'em_conferencia',
  FECHADO: 'fechado',
  REABERTO: 'reaberto',
} as const;

@Schema({ collection: 'financeiroFechamentosMensais', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class FechamentoMensalFinanceiro {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  competencia: string;

  @Prop({ required: true })
  periodoInicio: Date;

  @Prop({ required: true })
  periodoFim: Date;

  @Prop({ required: true, enum: Object.values(FECHAMENTO_MENSAL_STATUS), default: FECHAMENTO_MENSAL_STATUS.EM_CONFERENCIA })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  resumo: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot: Record<string, unknown>;

  @Prop({ required: true })
  snapshotHashSha256: string;

  @Prop()
  observacoes?: string;

  @Prop()
  fechadoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  fechadoPor?: Types.ObjectId;

  @Prop()
  reabertoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  reabertoPor?: Types.ObjectId;

  @Prop()
  motivoReabertura?: string;
}

export const FechamentoMensalFinanceiroSchema = SchemaFactory.createForClass(FechamentoMensalFinanceiro);
FechamentoMensalFinanceiroSchema.index({ empresaId: 1, competencia: 1 }, { unique: true });
