import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificacaoDocument = Notificacao & Document;

@Schema({ collection: 'notificacao' })
export class Notificacao {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  usuarioId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente' })
  clienteId?: Types.ObjectId;

  @Prop({ required: true })
  tipo: string;

  @Prop({ required: true })
  destino: string;

  @Prop({ required: true })
  mensagem: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: Date, default: Date.now })
  criadoEm: Date;
}

export const NotificacaoSchema = SchemaFactory.createForClass(Notificacao);
