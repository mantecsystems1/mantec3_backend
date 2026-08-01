import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AnexoFinanceiroDocument = AnexoFinanceiro & Document;

export const ANEXO_FINANCEIRO_VINCULO_TIPO = {
  FECHAMENTO_MENSAL: 'fechamento_mensal',
  MOVIMENTO_CAIXA: 'movimento_caixa',
  TITULO_FINANCEIRO: 'titulo_financeiro',
  CONTA_FINANCEIRA: 'conta_financeira',
  RECORRENCIA_FINANCEIRA: 'recorrencia_financeira',
  OUTRO: 'outro',
} as const;

@Schema({ collection: 'financeiroAnexos', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class AnexoFinanceiro {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  competencia: string;

  @Prop({ required: true })
  periodoInicio: Date;

  @Prop({ required: true })
  periodoFim: Date;

  @Prop({ required: true, enum: Object.values(ANEXO_FINANCEIRO_VINCULO_TIPO), default: ANEXO_FINANCEIRO_VINCULO_TIPO.FECHAMENTO_MENSAL })
  vinculoTipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  vinculoId?: Types.ObjectId;

  @Prop()
  descricao?: string;

  @Prop({ required: true })
  nomeOriginal: string;

  @Prop({ required: true })
  nomeArquivo: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  tamanhoBytes: number;

  @Prop({ required: true })
  urlArquivo: string;

  @Prop({ required: true })
  hashSha256: string;

  @Prop({ required: true })
  dataReferencia: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  enviadoPor?: Types.ObjectId;

  @Prop({ default: true })
  ativo: boolean;

  @Prop()
  removidoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  removidoPor?: Types.ObjectId;
}

export const AnexoFinanceiroSchema = SchemaFactory.createForClass(AnexoFinanceiro);
