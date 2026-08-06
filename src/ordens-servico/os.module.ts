import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OsService } from './os.service';
import { OsController } from './os.controller';
import { OrdemServico, OrdemServicoSchema } from './schemas/ordem-servico.schema';
import { ItensUtilizadosOS, ItensUtilizadosOSSchema } from './schemas/itens-utilizados-os.schema';
import { PecasReservadasOS, PecasReservadasOSSchema } from './schemas/pecas-reservadas-os.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { EstoqueModule } from '../estoque/estoque.module';
import { Venda, VendaSchema } from '../financeiro/vendas/schemas/venda.schema';

@Module({
  imports: [
    AuditoriaModule,
    EstoqueModule,
    MongooseModule.forFeature([
      { name: OrdemServico.name, schema: OrdemServicoSchema },
      { name: ItensUtilizadosOS.name, schema: ItensUtilizadosOSSchema },
      { name: PecasReservadasOS.name, schema: PecasReservadasOSSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
  ],
  controllers: [OsController],
  providers: [OsService],
  exports: [OsService],
})
export class OsModule {}
