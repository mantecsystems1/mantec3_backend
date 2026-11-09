import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { CATEGORIAS_EQUIPAMENTO } from '../../common/equipamento-categorias';

export type OrdemServicoDocument = OrdemServico & Document;

@Schema({ _id: false })
export class ChecklistQualidadeOsItem {
  @Prop({ required: true, enum: ['ligar_desligar', 'tela_toque', 'botoes', 'cameras', 'audio_microfone', 'conexoes', 'carregamento'] })
  codigo: string;

  @Prop({ required: true, enum: ['aprovado', 'falha', 'nao_aplicavel'] })
  resultado: string;

  @Prop({ maxlength: 500 })
  observacao?: string;
}

export const ChecklistQualidadeOsItemSchema = SchemaFactory.createForClass(ChecklistQualidadeOsItem);

@Schema({ collection: 'ordensServico', timestamps: { createdAt: 'criadoEm' } })
export class OrdemServico {
  @Prop()
  numero?: string;

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

  @Prop({ enum: CATEGORIAS_EQUIPAMENTO })
  categoriaEquipamento?: string;

  @Prop({ required: true })
  prioridade: string;

  @Prop({ required: true })
  dataEntrada: Date;

  @Prop()
  dataPrevistaEntrega?: Date;

  @Prop({ type: [ChecklistQualidadeOsItemSchema] })
  checklistQualidade?: ChecklistQualidadeOsItem[];

  @Prop({ default: 0 })
  checklistQualidadeRevisao?: number;

  @Prop()
  checklistQualidadeAtualizadaEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  checklistQualidadeAtualizadaPor?: Types.ObjectId;

  @Prop({ maxlength: 1000 })
  checklistQualidadeCorrecaoMotivo?: string;

  @Prop()
  checklistQualidadeCorrigidoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  checklistQualidadeCorrigidoPor?: Types.ObjectId;

  @Prop()
  dataConclusao: Date;

  @Prop()
  dataEntrega?: Date;

  @Prop()
  entregueParaNome?: string;

  @Prop({ enum: ['cliente', 'terceiro_autorizado'] })
  entregueParaTipo?: string;

  @Prop({ default: false })
  autorizacaoTerceiroConfirmada?: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente' })
  autorizadoPorClienteId?: Types.ObjectId;

  @Prop()
  autorizacaoTerceiroRegistradaEm?: Date;

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

OrdemServicoSchema.index({ empresaId: 1, statusOperacional: 1, criadoEm: -1 });
OrdemServicoSchema.index({ empresaId: 1, clienteId: 1, criadoEm: -1 });
OrdemServicoSchema.index({ empresaId: 1, orcamentoId: 1 });
OrdemServicoSchema.index({ empresaId: 1, recebimentoEquipamentoId: 1 });
OrdemServicoSchema.index({ empresaId: 1, numero: 1 }, { unique: true, partialFilterExpression: { numero: { $type: 'string' } } });
