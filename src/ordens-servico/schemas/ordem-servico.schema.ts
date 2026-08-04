import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type OrdemServicoDocument = OrdemServico & Document;

@Schema({ collection: 'ordensServico', timestamps: { createdAt: 'criadoEm' } })
export class OrdemServico {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  tecnicoId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Orcamento' })
  orcamentoId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RecebimentoEquipamento', required: true })
  recebimentoEquipamentoId: Types.ObjectId;

  @Prop({ required: true })
  statusOperacional: string;

  @Prop({ required: true })
  prioridade: string;

  @Prop({ required: true })
  dataEntrada: Date;

  @Prop()
  dataConclusao: Date;

  @Prop()
  dataEntrega?: Date;

  @Prop()
  entregueParaNome?: string;

  @Prop()
  entregueParaDocumento?: string;

  @Prop()
  assinaturaEntregaImagemBase64?: string;

  @Prop()
  assinaturaEntregaHashSha256?: string;

  @Prop()
  ipAssinaturaEntrega?: string;

  @Prop()
  userAgentAssinaturaEntrega?: string;

  @Prop()
  observacoesEntrega?: string;
}

export const OrdemServicoSchema = SchemaFactory.createForClass(OrdemServico);
