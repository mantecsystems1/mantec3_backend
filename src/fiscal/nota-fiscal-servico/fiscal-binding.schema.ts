import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'fiscalSimulationBindings', timestamps: true })
export class FiscalBinding {
  @Prop({ required: true }) empresaId: string;
  @Prop({ required: true }) emitterId: string;
  @Prop({ required: true }) createdBy: string;
}
export const FiscalBindingSchema = SchemaFactory.createForClass(FiscalBinding);
FiscalBindingSchema.index({ empresaId: 1 }, { unique: true });
FiscalBindingSchema.index({ emitterId: 1 }, { unique: true });
