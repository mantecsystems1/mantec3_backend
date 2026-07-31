import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type LogEventoDocument = LogEvento & Document;

@Schema({ collection: 'logEvento' })
export class LogEvento {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ required: true })
  tipoEvento: string;

  @Prop({ required: true })
  entidade: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entidadeId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  data: Date;

  @Prop({ type: Object })
  dados: Record<string, unknown>;
}

export const LogEventoSchema = SchemaFactory.createForClass(LogEvento);
