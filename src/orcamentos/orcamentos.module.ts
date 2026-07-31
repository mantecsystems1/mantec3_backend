import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrcamentosService } from './orcamentos.service';
import { OrcamentosController } from './orcamentos.controller';
import { Orcamento, OrcamentoSchema } from './schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoSchema } from './schemas/itens-orcamento.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { OsModule } from '../ordens-servico/os.module';

@Module({
  imports: [
    AuditoriaModule,
    OsModule,
    MongooseModule.forFeature([
      { name: Orcamento.name, schema: OrcamentoSchema },
      { name: ItensOrcamento.name, schema: ItensOrcamentoSchema },
    ]),
  ],
  controllers: [OrcamentosController],
  providers: [OrcamentosService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
