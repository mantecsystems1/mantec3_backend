import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'fiscalEmitterRegistrations', timestamps: true })
export class FiscalRegistration {
  @Prop({ required: true }) empresaId: string;
  @Prop({ required: true }) createdBy: string;
  @Prop({ required: true }) payloadHash: string;
  @Prop({ type: Object, required: true }) payload: { cnpj: string; legalName: string; city: string; state: string };
  @Prop() emitterId?: string;
}
export const FiscalRegistrationSchema = SchemaFactory.createForClass(FiscalRegistration);
FiscalRegistrationSchema.index({ empresaId: 1 }, { unique: true });
