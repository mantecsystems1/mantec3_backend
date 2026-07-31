import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/mongoose.module';
import { EmpresaModule } from './core/empresa/empresa.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PermissoesModule } from './permissoes/permissoes.module';
import { ClientesModule } from './clientes/clientes.module';
import { RecebimentoModule } from './recebimento/recebimento.module';
import { OrcamentosModule } from './orcamentos/orcamentos.module';
import { OsModule } from './ordens-servico/os.module';
import { EstoqueModule } from './estoque/estoque.module';
import { ComprasModule } from './compras/compras.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { NotaFiscalServicoModule } from './fiscal/nota-fiscal-servico/nota-fiscal-servico.module';
import { GarantiasModule } from './garantias/garantias.module';
import { ComunicacaoModule } from './comunicacao/comunicacao.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { ProdutosModule } from './catalogo/produtos/produtos.module';
import { ServicosModule } from './catalogo/servicos/servicos.module';
import { CompatibilidadeModule } from './catalogo/compatibilidade/compatibilidade.module';
import { PortalClienteModule } from './portal-cliente/portal-cliente.module';
import { DocumentosModule } from './documentos/documentos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EmpresaModule,
    UsuariosModule,
    PermissoesModule,
    ClientesModule,
    RecebimentoModule,
    OrcamentosModule,
    OsModule,
    EstoqueModule,
    ComprasModule,
    FinanceiroModule,
    NotaFiscalServicoModule,
    GarantiasModule,
    ComunicacaoModule,
    AuditoriaModule,
    AuthModule,
    ProdutosModule,
    ServicosModule,
    CompatibilidadeModule,
    PortalClienteModule,
    DocumentosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
