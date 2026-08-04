import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Empresa, EmpresaSchema } from './schemas/empresa.schema';
import { EmpresaService } from './empresa.service';
import { EmpresaController } from './empresa.controller';
import { AuditoriaModule } from '../../auditoria/auditoria.module';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: Empresa.name, schema: EmpresaSchema },
    ]),
  ],
  controllers: [EmpresaController],
  providers: [EmpresaService],
})
export class EmpresaModule {}
