import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TemplateComunicacaoDocument = TemplateComunicacao & Document;

@Schema({ collection: 'templatesComunicacao', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class TemplateComunicacao {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  chave: string;

  @Prop({ required: true })
  nome: string;

  @Prop({ required: true })
  assunto: string;

  @Prop({ required: true })
  mensagem: string;

  @Prop({ type: [String], default: [] })
  variaveis: string[];

  @Prop({ default: true })
  ativo: boolean;
}

export const TemplateComunicacaoSchema = SchemaFactory.createForClass(TemplateComunicacao);
TemplateComunicacaoSchema.index({ empresaId: 1, chave: 1 }, { unique: true });
