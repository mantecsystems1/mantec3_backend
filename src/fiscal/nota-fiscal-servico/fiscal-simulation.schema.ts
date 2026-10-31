import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'fiscalSimulations', timestamps: true })
export class FiscalSimulation {
  @Prop({ required: true }) empresaId: string;
  @Prop({ required: true }) requestId: string;
  @Prop({ required: true }) emitterId: string;
  @Prop({ required: true }) competenceDate: string;
  @Prop() documentId?: string;
  @Prop() receiptContent?: string;
  @Prop() receiptSha256?: string;
  createdAt: Date;
}
export type FiscalSimulationDocument = HydratedDocument<FiscalSimulation>;
export const FiscalSimulationSchema = SchemaFactory.createForClass(FiscalSimulation);
FiscalSimulationSchema.index({ empresaId: 1, requestId: 1 }, { unique: true });
FiscalSimulationSchema.index({ empresaId: 1, _id: -1 });
