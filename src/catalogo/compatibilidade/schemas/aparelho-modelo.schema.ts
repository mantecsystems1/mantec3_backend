import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AparelhoModeloDocument = AparelhoModelo & Document;

@Schema({ collection: 'aparelhosModelos', timestamps: { createdAt: 'criadoEm' } })
export class AparelhoModelo {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa' })
  empresaId?: Types.ObjectId;

  @Prop({ required: true })
  marca: string;

  @Prop({ required: true })
  modelo: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ required: true, index: true })
  normalizado: string;

  @Prop({ default: true })
  ativo: boolean;
}

export const AparelhoModeloSchema = SchemaFactory.createForClass(AparelhoModelo);

