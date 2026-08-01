import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { FORMA_PAGAMENTO_FINANCEIRO, MOVIMENTO_CAIXA_STATUS, MOVIMENTO_CAIXA_TIPO } from '../financeiro-adm.types';

export type MovimentoCaixaDocument = MovimentoCaixa & Document;

@Schema({ collection: 'financeiroMovimentosCaixa', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class MovimentoCaixa {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ContaFinanceira', required: true })
  contaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CategoriaFinanceira', required: true })
  categoriaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TituloFinanceiro' })
  tituloId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(MOVIMENTO_CAIXA_TIPO) })
  tipo: string;

  @Prop({ required: true })
  descricao: string;

  @Prop({ type: MongooseSchema.Types.Decimal128, required: true })
  valor: Types.Decimal128;

  @Prop({ required: true })
  dataMovimento: Date;

  @Prop({ required: true, enum: Object.values(FORMA_PAGAMENTO_FINANCEIRO) })
  formaPagamento: string;

  @Prop({ default: MOVIMENTO_CAIXA_STATUS.CONFIRMADO, enum: Object.values(MOVIMENTO_CAIXA_STATUS) })
  status: string;

  @Prop()
  origemTipo?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  origemId?: Types.ObjectId;

  @Prop()
  observacoes?: string;

  @Prop()
  estornadoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  estornadoPor?: Types.ObjectId;

  @Prop()
  motivoEstorno?: string;
}

export const MovimentoCaixaSchema = SchemaFactory.createForClass(MovimentoCaixa);
