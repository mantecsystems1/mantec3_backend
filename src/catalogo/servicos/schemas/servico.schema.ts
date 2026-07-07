import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ServicoDocument = Servico & Document;

@Schema({ timestamps: true })
export class Servico {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  @Prop()
  descricao: string;

  @Prop({ type: MongooseSchema.Types.Decimal128 })
  precoPadrao: Types.Decimal128;

  @Prop()
  tempoEstimado: number;

  @Prop({ default: true })
  ativo: boolean;
}

export const ServicoSchema = SchemaFactory.createForClass(Servico);

ServicoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // Ensure precoPadrao is serialized as string and provide a numeric 'valor' field
    if (ret.precoPadrao !== undefined && ret.precoPadrao !== null) {
      try {
        // If it's a Decimal128, toString() will return the decimal string
        const precoStr = typeof ret.precoPadrao === 'object' && typeof ret.precoPadrao.toString === 'function'
          ? ret.precoPadrao.toString()
          : String(ret.precoPadrao);
        ret.precoPadrao = precoStr;
        const num = Number(precoStr);
        ret.valor = Number.isNaN(num) ? null : num;
      } catch (e) {
        ret.precoPadrao = String(ret.precoPadrao);
        ret.valor = null;
      }
    } else {
      // no precoPadrao, ensure valor is null for consistency
      ret.valor = ret.valor ?? null;
    }
    return ret;
  },
});
