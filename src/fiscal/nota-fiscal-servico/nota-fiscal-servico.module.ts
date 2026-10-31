import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotaFiscalServicoService } from './nota-fiscal-servico.service';
import { NotaFiscalServicoController } from './nota-fiscal-servico.controller';
import { NotaFiscalServico, NotaFiscalServicoSchema } from './nota-fiscal-servico.schema';
import { Venda, VendaSchema } from '../../financeiro/vendas/schemas/venda.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { FiscalSimulation, FiscalSimulationSchema } from './fiscal-simulation.schema';
import { FiscalSimulationService } from './fiscal-simulation.service';
import { FiscalSimulationController } from './fiscal-simulation.controller';
import { FiscalBinding, FiscalBindingSchema } from './fiscal-binding.schema';
import { FiscalRegistration, FiscalRegistrationSchema } from './fiscal-registration.schema';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: NotaFiscalServico.name, schema: NotaFiscalServicoSchema },
      { name: Venda.name, schema: VendaSchema },
      { name: FiscalSimulation.name, schema: FiscalSimulationSchema },
      { name: FiscalBinding.name, schema: FiscalBindingSchema },
      { name: FiscalRegistration.name, schema: FiscalRegistrationSchema },
    ]),
  ],
  controllers: [NotaFiscalServicoController, FiscalSimulationController],
  providers: [NotaFiscalServicoService, FiscalSimulationService],
  exports: [NotaFiscalServicoService],
})
export class NotaFiscalServicoModule {}
