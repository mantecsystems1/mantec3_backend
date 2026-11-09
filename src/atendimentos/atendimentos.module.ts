import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from '../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { Cliente, ClienteSchema } from '../clientes/schemas/cliente.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { Orcamento, OrcamentoSchema } from '../orcamentos/schemas/orcamento.schema';
import { OrdemServico, OrdemServicoSchema } from '../ordens-servico/schemas/ordem-servico.schema';
import { Venda, VendaSchema } from '../financeiro/vendas/schemas/venda.schema';
import { Pagamento, PagamentoSchema } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { MovimentoCaixa, MovimentoCaixaSchema } from '../financeiro/financeiro-adm/schemas/movimento-caixa.schema';
import { LogEvento, LogEventoSchema } from '../auditoria/schemas/log-evento.schema';
import { AtendimentosController } from './atendimentos.controller';
import { AtendimentosService } from './atendimentos.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
    { name: Cliente.name, schema: ClienteSchema }, { name: Usuario.name, schema: UsuarioSchema },
    { name: Orcamento.name, schema: OrcamentoSchema }, { name: OrdemServico.name, schema: OrdemServicoSchema },
    { name: Venda.name, schema: VendaSchema }, { name: Pagamento.name, schema: PagamentoSchema },
    { name: MovimentoCaixa.name, schema: MovimentoCaixaSchema }, { name: LogEvento.name, schema: LogEventoSchema },
  ])],
  controllers: [AtendimentosController], providers: [AtendimentosService],
})
export class AtendimentosModule {}
