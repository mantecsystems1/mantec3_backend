import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmpresaDocument = Empresa & Document;

@Schema({ _id: false })
export class Endereco {
  @Prop({ required: true })
  logradouro: string;
  @Prop({ required: true })
  numero: string;
  @Prop()
  complemento?: string;
  @Prop({ required: true })
  bairro: string;
  @Prop({ required: true })
  cidade: string;
  @Prop({ required: true })
  estado: string;
  @Prop({ required: true })
  cep: string;
}
const EnderecoSchema = SchemaFactory.createForClass(Endereco);

@Schema({ timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' } })
export class Empresa {
  @Prop({ required: true })
  nomeFantasia: string;

  @Prop({ required: true })
  razaoSocial: string;

  @Prop({ required: true, unique: true })
  cnpj: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  telefone: string;

  @Prop()
  logoUrl?: string;

  @Prop({ type: EnderecoSchema, required: true })
  endereco: Endereco;

  @Prop({ default: true })
  ativa: boolean;

  criadoEm: Date;
  atualizadoEm: Date;
}

export const EmpresaSchema = SchemaFactory.createForClass(Empresa);
