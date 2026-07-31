import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PecasReservadasOSDocument = PecasReservadasOS & Document;

@Schema({ collection: 'pecasReservadasOS', timestamps: { createdAt: 'criadoEm' } })
export class PecasReservadasOS {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'OrdemServico', required: true })
  ordemServicoId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produtoId: Types.ObjectId;

  @Prop({ required: true })
  quantidade: number;
}

export const PecasReservadasOSSchema = SchemaFactory.createForClass(PecasReservadasOS);
