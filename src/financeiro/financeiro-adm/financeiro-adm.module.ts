import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { Empresa, EmpresaSchema } from '../../core/empresa/schemas/empresa.schema';
import { FinanceiroAdmController } from './financeiro-adm.controller';
import { FinanceiroAdmService } from './financeiro-adm.service';
import { ContaFinanceira, ContaFinanceiraSchema } from './schemas/conta-financeira.schema';
import { CategoriaFinanceira, CategoriaFinanceiraSchema } from './schemas/categoria-financeira.schema';
import { TituloFinanceiro, TituloFinanceiroSchema } from './schemas/titulo-financeiro.schema';
import { MovimentoCaixa, MovimentoCaixaSchema } from './schemas/movimento-caixa.schema';
import { RecorrenciaFinanceira, RecorrenciaFinanceiraSchema } from './schemas/recorrencia-financeira.schema';
import { AnexoFinanceiro, AnexoFinanceiroSchema } from './schemas/anexo-financeiro.schema';
import { FechamentoMensalFinanceiro, FechamentoMensalFinanceiroSchema } from './schemas/fechamento-mensal-financeiro.schema';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: ContaFinanceira.name, schema: ContaFinanceiraSchema },
      { name: CategoriaFinanceira.name, schema: CategoriaFinanceiraSchema },
      { name: TituloFinanceiro.name, schema: TituloFinanceiroSchema },
      { name: MovimentoCaixa.name, schema: MovimentoCaixaSchema },
      { name: RecorrenciaFinanceira.name, schema: RecorrenciaFinanceiraSchema },
      { name: AnexoFinanceiro.name, schema: AnexoFinanceiroSchema },
      { name: FechamentoMensalFinanceiro.name, schema: FechamentoMensalFinanceiroSchema },
      { name: Empresa.name, schema: EmpresaSchema },
    ]),
  ],
  controllers: [FinanceiroAdmController],
  providers: [FinanceiroAdmService],
  exports: [FinanceiroAdmService],
})
export class FinanceiroAdmModule {}
