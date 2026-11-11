import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ClienteDocument = Cliente & Document;

@Schema({ timestamps: { createdAt: 'criadoEm' } })
export class Cliente {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  /** Opcional: clientes importados do sistema antigo não têm documento. Único quando preenchido. */
  @Prop()
  cpfCnpj?: string;

  @Prop()
  telefone: string;

  @Prop()
  email: string;

  @Prop({ type: Object })
  endereco: any;

  @Prop({ default: true })
  ativo: boolean;
}

export const ClienteSchema = SchemaFactory.createForClass(Cliente);

// Único só entre documentos preenchidos: vários clientes podem ficar sem CPF/CNPJ.
// Substitui o índice antigo "empresaId_1_cpfCnpj_1" (único para todos), que precisa ser
// removido no banco antes de existirem dois clientes sem documento (docs/cliente-cpf-opcional.md).
export const CLIENTE_DOCUMENTO_INDEX = 'empresaId_1_cpfCnpj_1_preenchido';
ClienteSchema.index(
  { empresaId: 1, cpfCnpj: 1 },
  { unique: true, name: CLIENTE_DOCUMENTO_INDEX, partialFilterExpression: { cpfCnpj: { $gt: '' } } },
);
ClienteSchema.index({ empresaId: 1, ativo: 1, nome: 1 });
