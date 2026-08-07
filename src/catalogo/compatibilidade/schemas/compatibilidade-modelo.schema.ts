import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type CompatibilidadeModeloDocument = CompatibilidadeModelo & Document;

@Schema({ collection: 'compatibilidadesModelo', timestamps: { createdAt: 'criadoEm' } })
export class CompatibilidadeModelo {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa' })
  empresaId?: Types.ObjectId;

  @Prop({ required: true, default: 'pelicula' })
  tipoProduto: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AparelhoModelo', required: true })
  modeloBaseId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AparelhoModelo', required: true })
  modeloCompativelId: Types.ObjectId;

  @Prop()
  observacoes?: string;

  @Prop({ default: true })
  ativo: boolean;
}

export const CompatibilidadeModeloSchema = SchemaFactory.createForClass(CompatibilidadeModelo);

