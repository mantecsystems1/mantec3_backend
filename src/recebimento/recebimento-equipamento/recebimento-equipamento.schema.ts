import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { CATEGORIAS_EQUIPAMENTO } from '../../common/equipamento-categorias';

export type RecebimentoEquipamentoDocument = RecebimentoEquipamento & Document;

@Schema({ collection: 'recebimentosEquipamento', timestamps: { createdAt: 'criadoEm' } })
export class RecebimentoEquipamento {
  @Prop()
  numero?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Empresa', required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  clienteId: Types.ObjectId;

  @Prop({ required: true })
  tipoEquipamento: string;

  @Prop({ enum: CATEGORIAS_EQUIPAMENTO })
  categoriaEquipamento?: string;

  @Prop({ required: true })
  marca: string;

  @Prop({ required: true })
  modelo: string;

  @Prop()
  imeiOuSerial?: string;

  @Prop({ required: true })
  dataRecebimento: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario', required: true })
  recebidoPor: Types.ObjectId;

  @Prop()
  observacoesGerais: string;

  @Prop({ required: true })
  status: string;

  @Prop({ select: false })
  operacaoId?: string;

  @Prop({ select: false })
  operacaoHash?: string;

  @Prop({ enum: ['pendente_midias', 'confirmado'] })
  estadoSalvamento?: string;

  @Prop({ enum: ['sem_reparo'] })
  resultadoAtendimento?: string;

  @Prop({ maxlength: 500 })
  motivoSemReparo?: string;

  @Prop()
  encerradoSemReparoEm?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  encerradoSemReparoPor?: Types.ObjectId;

  @Prop({ enum: ['pendente', 'devolvido'] })
  statusDevolucao?: string;

  @Prop()
  devolucaoEm?: Date;

  @Prop({ maxlength: 120 })
  devolvidoParaNome?: string;

  @Prop({ enum: ['cliente', 'terceiro_autorizado'] })
  devolucaoParaTipo?: string;

  @Prop({ default: false })
  devolucaoAutorizacaoTerceiroConfirmada?: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente' })
  devolucaoAutorizadoPorClienteId?: Types.ObjectId;

  @Prop()
  devolucaoAutorizacaoRegistradaEm?: Date;

  @Prop({ select: false })
  devolucaoAssinaturaImagemBase64?: string;

  @Prop()
  devolucaoAssinaturaHashSha256?: string;

  @Prop()
  devolucaoIpAssinatura?: string;

  @Prop()
  devolucaoUserAgentAssinatura?: string;

  @Prop({ maxlength: 500 })
  observacoesDevolucao?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Usuario' })
  devolucaoRegistradaPor?: Types.ObjectId;

  @Prop({ type: [{ _id: false, chaveCliente: String, nomeOriginal: String, hashSha256: String, tipo: String, descricao: String, origemCaptura: String, capturadoEm: String }], default: undefined })
  midiasEsperadas?: { chaveCliente: string; nomeOriginal: string; hashSha256: string; tipo: string; descricao?: string; origemCaptura?: string; capturadoEm?: string }[];
}

export const RecebimentoEquipamentoSchema = SchemaFactory.createForClass(RecebimentoEquipamento);

RecebimentoEquipamentoSchema.index(
  { empresaId: 1, recebidoPor: 1, operacaoId: 1 },
  { unique: true, partialFilterExpression: { operacaoId: { $type: 'string' } } },
);
RecebimentoEquipamentoSchema.index(
  { empresaId: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } },
);
