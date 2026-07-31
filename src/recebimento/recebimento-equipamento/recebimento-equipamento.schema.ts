import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type RecebimentoEquipamentoDocument = RecebimentoEquipamento & Document;

@Schema({ collection: 'recebimentosEquipamento', timestamps: { createdAt: 'criadoEm' } })
export class RecebimentoEquipamento {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ required: true })
  tipoEquipamento: string;

  @Prop({ required: true })
  marca: string;

  @Prop({ required: true })
  modelo: string;

  @Prop()
  imeiOuSerial?: string;

  @Prop({ required: true })
  dataRecebimento: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  recebidoPor: Types.ObjectId;

  @Prop()
  observacoesGerais: string;

  @Prop({ required: true })
  status: string;
}

export const RecebimentoEquipamentoSchema = SchemaFactory.createForClass(RecebimentoEquipamento);
