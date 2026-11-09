import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type OperacaoVendaDocument = OperacaoVenda & Document;

@Schema({ collection: 'operacoesVendas', timestamps: { createdAt: 'criadoEm' } })
export class OperacaoVenda {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  operadorId: Types.ObjectId;

  @Prop({ required: true })
  operacaoId: string;

  @Prop({ required: true, select: false })
  hashConteudo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda', required: true })
  vendaId: Types.ObjectId;
}

export const OperacaoVendaSchema = SchemaFactory.createForClass(OperacaoVenda);

OperacaoVendaSchema.index({ empresaId: 1, operacaoId: 1 }, { unique: true });
OperacaoVendaSchema.index({ empresaId: 1, vendaId: 1 });
