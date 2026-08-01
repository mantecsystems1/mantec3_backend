import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { CATEGORIA_FINANCEIRA_CLASSIFICACAO, CATEGORIA_FINANCEIRA_TIPO } from '../financeiro-adm.types';

export type CategoriaFinanceiraDocument = CategoriaFinanceira & Document;

@Schema({ collection: 'financeiroCategorias', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class CategoriaFinanceira {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  @Prop({ required: true, enum: Object.values(CATEGORIA_FINANCEIRA_TIPO) })
  tipo: string;

  @Prop({ default: 'outros' })
  grupo: string;

  @Prop({ required: true, enum: Object.values(CATEGORIA_FINANCEIRA_CLASSIFICACAO), default: CATEGORIA_FINANCEIRA_CLASSIFICACAO.EMPRESA })
  classificacao: string;

  @Prop({ default: false })
  recorrente: boolean;

  @Prop({ default: false })
  dedutivel: boolean;

  @Prop()
  cor?: string;

  @Prop({ default: true })
  ativo: boolean;

  @Prop()
  observacoes?: string;
}

export const CategoriaFinanceiraSchema = SchemaFactory.createForClass(CategoriaFinanceira);
