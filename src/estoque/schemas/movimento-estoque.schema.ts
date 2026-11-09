import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MovimentosEstoqueDocument = MovimentosEstoque & Document;

@Schema({ collection: 'movimentosEstoque', timestamps: { createdAt: 'criadoEm' } })
export class MovimentosEstoque {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true, immutable: true })
  produtoId: Types.ObjectId;

  @Prop({ required: true, immutable: true })
  tipo: string;

  @Prop({ required: true, immutable: true })
  quantidade: number;

  @Prop({ required: true, immutable: true })
  origemTipo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, immutable: true })
  origemId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'MovimentosEstoque', immutable: true })
  estornoDeId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'MovimentosEstoque', immutable: true })
  substituiId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'MovimentosEstoque' })
  estornoId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'MovimentosEstoque' })
  substituidoPorId?: Types.ObjectId;

  @Prop()
  estornadoEm?: Date;
}

export const MovimentosEstoqueSchema = SchemaFactory.createForClass(MovimentosEstoque);

MovimentosEstoqueSchema.index({ empresaId: 1, produtoId: 1, criadoEm: -1 });
MovimentosEstoqueSchema.index({ empresaId: 1, origemTipo: 1, origemId: 1 });
