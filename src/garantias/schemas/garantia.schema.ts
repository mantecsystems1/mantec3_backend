import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type GarantiaDocument = Garantia & Document;

@Schema({ collection: 'garantia' })
export class Garantia {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda' })
  vendaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'OrdemServico' })
  ordemServicoId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produtoId: Types.ObjectId;

  @Prop({ required: true })
  quantidade: number;

  @Prop({ required: true })
  motivo: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Fornecedor', required: true })
  fornecedorId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  criadoEm: Date;
}

export const GarantiaSchema = SchemaFactory.createForClass(Garantia);
