import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProdutoDocument = Produto & Document;

@Schema({ timestamps: { createdAt: 'criadoEm' } })
export class Produto {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  @Prop()
  descricao: string;

  @Prop()
  codigoInterno: string;

  @Prop({ index: true })
  tipoProduto?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AparelhoModelo' })
  aparelhoModeloId?: Types.ObjectId;

  @Prop()
  qualidade?: string;

  @Prop()
  temAro?: string;

  @Prop()
  cor?: string;

  @Prop({ type: MongooseSchema.Types.Decimal128 })
  precoVenda: Types.Decimal128;

  @Prop({ default: true })
  ativo: boolean;

  @Prop()
  fotoUrl?: string;

  @Prop()
  fotoNomeOriginal?: string;

  @Prop()
  fotoNomeArquivo?: string;

  @Prop()
  fotoMimeType?: string;

  @Prop()
  fotoTamanhoBytes?: number;

  @Prop()
  fotoHashSha256?: string;

  @Prop()
  fotoOrigemCaptura?: string;

  @Prop()
  fotoCapturadaEm?: Date;
}

export const ProdutoSchema = SchemaFactory.createForClass(Produto);
