import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Empresa } from 'src/core/empresa/schemas/empresa.schema';

export type UsuarioDocument = Usuario & Document;

@Schema({ timestamps: { createdAt: 'criadoEm', updatedAt: false } })
export class Usuario {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Empresa;

  @Prop({ required: true })
  nome: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  senhaHash: string;

  @Prop({ default: true })
  ativo: boolean;

  @Prop({ default: 'tecnico' })
  perfil: string;

  criadoEm: Date;
}

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
