import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema, Types } from 'mongoose';
import type { DadosRascunhoRecebimentoDto } from './salvar-rascunho.dto';

export type RascunhoRecebimentoDocument = RascunhoRecebimento & Document;

@Schema({ collection: 'rascunhosRecebimento', timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class RascunhoRecebimento {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  operadorId: Types.ObjectId;

  @Prop({ required: true, immutable: true })
  operacaoId: string;

  @Prop({ required: true, default: 0 })
  revisao: number;

  @Prop({ required: true, enum: ['rascunho', 'convertido'], default: 'rascunho' })
  estado: 'rascunho' | 'convertido';

  @Prop({ type: MongoSchema.Types.Mixed, default: {} })
  dados: DadosRascunhoRecebimentoDto;

  @Prop({ select: false, default: '' })
  hashConteudo: string;

  @Prop({ type: MongoSchema.Types.ObjectId })
  recebimentoId?: Types.ObjectId;

  atualizadoEm?: Date;
}

export const RascunhoRecebimentoSchema = SchemaFactory.createForClass(RascunhoRecebimento);
RascunhoRecebimentoSchema.index({ empresaId: 1, operadorId: 1, operacaoId: 1 }, { unique: true });
RascunhoRecebimentoSchema.index({ empresaId: 1, operadorId: 1, estado: 1, atualizadoEm: -1 });
