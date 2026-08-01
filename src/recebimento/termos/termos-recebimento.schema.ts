import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TermosRecebimentoDocument = TermosRecebimento & Document;

@Schema({ collection: 'termosRecebimento', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class TermosRecebimento {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RecebimentoEquipamento', required: true })
  recebimentoEquipamentoId: Types.ObjectId;

  @Prop({ required: true })
  texto: string;

  @Prop({ default: false })
  assinado: boolean;

  @Prop()
  metodoAssinatura: string;

  @Prop()
  dataAssinatura: Date;

  @Prop()
  signatarioNome?: string;

  @Prop()
  signatarioDocumento?: string;

  @Prop()
  assinaturaImagemBase64?: string;

  @Prop()
  assinaturaHashSha256?: string;

  @Prop()
  termoHashSha256?: string;

  @Prop()
  ipAssinatura?: string;

  @Prop()
  userAgentAssinatura?: string;

  @Prop()
  observacoesAssinatura?: string;
}

export const TermosRecebimentoSchema = SchemaFactory.createForClass(TermosRecebimento);
