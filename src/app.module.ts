import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
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
import { AuthTokenGuard } from './common/guards/auth-token.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { SimpleRateLimitGuard } from './common/guards/simple-rate-limit.guard';
import { PrivateUploadsModule } from './common/uploads/private-uploads.module';
import { MongooseExceptionFilter } from './common/filters/mongoose-exception.filter';

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
    PrivateUploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: MongooseExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: SimpleRateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
