import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotaFiscalServicoService } from './nota-fiscal-servico.service';
import { NotaFiscalServicoController } from './nota-fiscal-servico.controller';
import { NotaFiscalServico, NotaFiscalServicoSchema } from './nota-fiscal-servico.schema';
import { Venda, VendaSchema } from '../../financeiro/vendas/schemas/venda.schema';
import { AuditoriaModule } from '../../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: NotaFiscalServico.name, schema: NotaFiscalServicoSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
  ],
  controllers: [NotaFiscalServicoController],
  providers: [NotaFiscalServicoService],
  exports: [NotaFiscalServicoService],
})
export class NotaFiscalServicoModule {}
