import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { RecebimentoEquipamento } from '../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { Cliente } from '../clientes/schemas/cliente.schema';
import { Usuario } from '../usuarios/schemas/usuario.schema';
import { Orcamento } from '../orcamentos/schemas/orcamento.schema';
import { OrdemServico } from '../ordens-servico/schemas/ordem-servico.schema';
import { Venda } from '../financeiro/vendas/schemas/venda.schema';
import { Pagamento } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { LogEvento } from '../auditoria/schemas/log-evento.schema';
import { EVENTOS_NEGOCIO as E, perfilPodeExecutarEvento, type EventoNegocio } from '../permissoes/matriz-permissoes';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { normalizarCategoriaEquipamento } from '../common/equipamento-categorias';
import { totalPagamentosValidosCentavos } from '../financeiro/vendas/venda-pagamentos-validos';
import { calcularStatusFinanceiroVenda } from '../financeiro/vendas/venda-financeiro.states';
import { dinheiroParaCentavos } from '../financeiro/financeiro-adm/financeiro-adm.types';
import type { AcaoFicha, AtendimentoFicha, EixoAtendimento, EventoFicha, OrcamentoFicha, OrdemFicha, PendenciaFicha, ProximaAcaoFicha, SecaoFicha, VendaFicha } from './atendimento-ficha.types';

type UsuarioConsulta = Omit<Usuario, 'empresaId'> & { empresaId: Types.ObjectId };

const statusLabels: Record<string, string> = {
  recebido: 'Recebido', em_triagem: 'Em triagem', encaminhado: 'Encaminhado',
  sem_reparo: 'Sem reparo', devolucao_pendente: 'Devolução pendente', devolvido_sem_reparo: 'Devolvido sem reparo',
  sem_cobranca: 'Sem cobrança',
  rascunho: 'Em preparação', enviado: 'Aguardando aprovação', aprovado: 'Aprovado',
  reprovado: 'Recusado', rejeitado: 'Recusado', cancelado: 'Cancelado', expirado: 'Expirado',
  aberta: 'Aguardando diagnóstico', em_diagnostico: 'Em diagnóstico', aguardando_peca: 'Aguardando peça',
  em_execucao: 'Em reparo', concluida: 'Serviço concluído', cancelada: 'Cancelada',
  pago: 'Pago', parcial: 'Pagamento parcial', pendente: 'Pagamento pendente',
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
};
const eventTitles: Record<string, string> = {
  RECEBIMENTO_CRIADO: 'Entrada registrada', RECEBIMENTO_ATUALIZADO: 'Entrada atualizada', RECEBIMENTO_REMOVIDO: 'Entrada removida', TERMO_GERADO: 'Termo de entrada registrado',
  RECEBIMENTO_SEM_REPARO: 'Atendimento encerrado sem reparo', RECEBIMENTO_DEVOLUCAO_REGISTRADA: 'Equipamento devolvido sem reparo',
  ORCAMENTO_CRIADO: 'Orçamento preparado', ORCAMENTO_ATUALIZADO: 'Orçamento atualizado', ORCAMENTO_ENVIADO: 'Orçamento disponibilizado ao cliente', ORCAMENTO_APROVADO: 'Orçamento aprovado',
  ORCAMENTO_REPROVADO: 'Orçamento recusado', ORCAMENTO_CANCELADO: 'Orçamento cancelado', OS_CRIADA: 'Ordem de serviço aberta',
  OS_STATUS_ALTERADO: 'Etapa técnica atualizada', OS_ENTREGA_ASSINADA: 'Retirada registrada', PECA_RESERVADA: 'Peça reservada', PECA_CONSUMIDA: 'Peça utilizada',
  VENDA_GERADA: 'Venda vinculada', VENDA_ATUALIZADA: 'Venda atualizada', VENDA_REMOVIDA: 'Venda cancelada',
  PAGAMENTO_REGISTRADO: 'Pagamento registrado', PAGAMENTO_ATUALIZADO: 'Pagamento atualizado', PAGAMENTO_REMOVIDO: 'Pagamento removido com estorno',
};
const iso = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
const label = (status: unknown) => statusLabels[String(status)] || 'Situação não reconhecida';
const available = <T>(itens: T[]): SecaoFicha<T> => ({ estado: 'disponivel', itens });
const noAccess = <T>(): SecaoFicha<T> => ({ estado: 'sem_acesso', mensagem: 'Seu perfil não permite consultar esta parte do atendimento.' });
const unavailable = <T>(): SecaoFicha<T> => ({ estado: 'indisponivel', mensagem: 'Não foi possível consultar esta parte do atendimento. Tente novamente.' });
const eixoIndisponivel = (estado: string): EixoAtendimento => ({ codigo: estado, label: estado === 'sem_acesso' ? 'Consulta restrita ao perfil responsável' : 'Consulta indisponível' });
const money = (value: unknown) => {
  const centavos = dinheiroParaCentavos(value);
  if (!Number.isFinite(centavos) || centavos < 0) throw new Error('Valor financeiro inconsistente.');
  return centavos / 100;
};

@Injectable()
export class AtendimentosService {
  constructor(@InjectConnection() private readonly db: Connection) {}

  async ficha(id: string, user?: CurrentUserPayload): Promise<AtendimentoFicha> {
    if (!user?.empresaId) throw new UnauthorizedException('Empresa do usuário não informada.');
    if (!Types.ObjectId.isValid(user.empresaId) || !Types.ObjectId.isValid(id)) throw new BadRequestException('Atendimento inválido.');
    const actor = user as CurrentUserPayload & { role?: string; perfis?: string[] };
    const perfis = [actor.perfil, actor.role, ...(Array.isArray(actor.perfis) ? actor.perfis : [])].filter((item): item is string => typeof item === 'string');
    const can = (evento: EventoNegocio) => perfis.some((perfil) => perfilPodeExecutarEvento(perfil, evento));
    if (!can(E.RECEBIMENTO_CONSULTAR)) throw new ForbiddenException('Seu perfil não permite consultar este atendimento.');
    const empresaId = new Types.ObjectId(user.empresaId);
    const recebimento = await this.db.model<RecebimentoEquipamento>(RecebimentoEquipamento.name)
      .findOne({ _id: id, empresaId }).select('_id numero clienteId categoriaEquipamento tipoEquipamento marca modelo imeiOuSerial dataRecebimento status estadoSalvamento recebidoPor resultadoAtendimento motivoSemReparo statusDevolucao devolucaoEm devolvidoParaNome devolucaoParaTipo devolucaoAutorizacaoTerceiroConfirmada').lean().exec();
    if (!recebimento) throw new NotFoundException('Atendimento não encontrado.');

    const pendencias: PendenciaFicha[] = [];
    const acoes: AcaoFicha[] = [];
    const addAction = (idAcao: string, text: string, href: string, evento: EventoNegocio) => {
      if (!can(evento)) return false;
      acoes.push({ id: idAcao, label: text, href, evento });
      return true;
    };
    const inconsistente = () => {
      if (!pendencias.some((item) => item.codigo === 'vinculos_inconsistentes')) pendencias.push({ codigo: 'vinculos_inconsistentes', label: 'Vínculos precisam de revisão', descricao: 'Há registros vinculados que não correspondem ao cliente e equipamento desta entrada. Os dados não foram exibidos.', responsavel: 'Gerência' });
    };
    addAction('ver_recebimento', 'Ver registro de entrada', `/recebimentos/${id}`, E.RECEBIMENTO_CONSULTAR);

    let cliente: AtendimentoFicha['cliente'] = { estado: 'sem_acesso', mensagem: 'Seu perfil não permite consultar o cliente.' };
    if (can(E.CLIENTE_CONSULTAR)) {
      try {
        const found = await this.db.model<Cliente>(Cliente.name).findOne({ _id: recebimento.clienteId, empresaId }).select('_id nome telefone').lean().exec();
        cliente = found ? { estado: 'disponivel', dados: { id: String(found._id), nome: found.nome, ...(found.telefone ? { telefone: found.telefone } : {}) } }
          : { estado: 'indisponivel', mensagem: 'O cliente vinculado não está disponível nesta empresa. Solicite revisão do cadastro.' };
        if (!found) inconsistente();
        if (found) addAction('ver_cliente', 'Ver histórico do cliente', `/clientes/${found._id}`, E.CLIENTE_CONSULTAR);
      } catch { cliente = { estado: 'indisponivel', mensagem: 'Não foi possível consultar o cliente. Tente novamente.' }; }
    }

    let orcamentos: SecaoFicha<OrcamentoFicha> = noAccess();
    if (can(E.ORCAMENTO_CONSULTAR)) {
      try {
        const records = await this.db.model<Orcamento>(Orcamento.name).find({ empresaId, recebimentoEquipamentoId: id })
          .select('_id numero clienteId status validade total criadoEm').sort({ criadoEm: -1, _id: -1 }).lean().exec();
        orcamentos = available(records.filter((item) => {
          if (String(item.clienteId) === String(recebimento.clienteId)) return true;
          inconsistente(); return false;
        }).map((item) => ({ id: String(item._id), referencia: item.numero ?? 'Orçamento antigo', referenciaLegada: !item.numero, status: item.status, statusLabel: label(item.status), validade: iso(item.validade), total: money(item.total), criadoEm: iso((item as { criadoEm?: unknown }).criadoEm) })));
      } catch { orcamentos = unavailable(); }
    }

    let ordensServico: SecaoFicha<OrdemFicha> = noAccess();
    if (can(E.OS_CONSULTAR)) {
      try {
        const records = await this.db.model<OrdemServico>(OrdemServico.name).find({ empresaId, recebimentoEquipamentoId: id })
          .select('_id numero clienteId tecnicoId orcamentoId statusOperacional prioridade dataEntrada dataConclusao dataEntrega').sort({ criadoEm: -1, _id: -1 }).lean().exec();
        const valid = records.filter((item) => {
          if (String(item.clienteId) !== String(recebimento.clienteId)) { inconsistente(); return false; }
          if (item.orcamentoId && orcamentos.estado !== 'disponivel') throw new Error('Não foi possível conferir o orçamento vinculado.');
          if (item.orcamentoId && orcamentos.estado === 'disponivel' && !orcamentos.itens.some((quote) => quote.id === String(item.orcamentoId))) { inconsistente(); return false; }
          return true;
        });
        const technicianIds = valid.map((item) => item.tecnicoId);
        const technicians = await this.db.model<UsuarioConsulta>(Usuario.name).find({ empresaId, _id: { $in: technicianIds } }).select('_id nome').lean().exec();
        ordensServico = available(valid.map((item) => {
          const tecnico = technicians.find((person) => String(person._id) === String(item.tecnicoId));
          if (!tecnico) inconsistente();
          return { id: String(item._id), referencia: item.numero ?? 'Ordem antiga', referenciaLegada: !item.numero, status: item.statusOperacional,
            statusLabel: item.dataEntrega ? 'Entregue' : label(item.statusOperacional), prioridade: item.prioridade, prioridadeLabel: label(item.prioridade),
            ...(tecnico ? { tecnico: tecnico.nome } : {}), dataEntrada: iso(item.dataEntrada), dataConclusao: iso(item.dataConclusao), dataEntrega: iso(item.dataEntrega) };
        }));
      } catch { ordensServico = unavailable(); }
    }

    let financeiro: SecaoFicha<VendaFicha> = noAccess();
    let paymentIds: Types.ObjectId[] = [];
    let vendaDoOrcamentoId: string | undefined;
    if (can(E.VENDA_CONSULTAR) && can(E.PAGAMENTO_CONSULTAR)) {
      if (ordensServico.estado !== 'disponivel' || orcamentos.estado !== 'disponivel') financeiro = unavailable();
      else {
        try {
          const orders = ordensServico.itens.map((item) => new Types.ObjectId(item.id));
          const quotes = orcamentos.itens.map((item) => new Types.ObjectId(item.id));
          // Older sales can explicitly reference a quote. They must remain visible,
          // but that link does not satisfy the existing delivery rule for an OS sale.
          const sales = await this.db.model<Venda>(Venda.name).find({ empresaId, $or: [
            { origemTipo: 'ordem_servico', origemId: { $in: orders } },
            { origemTipo: 'orcamento', origemId: { $in: quotes } },
          ] }).select('_id clienteId origemTipo total statusFinanceiro').sort({ criadoEm: -1, _id: -1 }).lean().exec();
          const valid = sales.filter((sale) => {
            if (String(sale.clienteId) === String(recebimento.clienteId)) return true;
            inconsistente(); return false;
          });
          const views: VendaFicha[] = [];
          for (const sale of valid) {
            const pago = await totalPagamentosValidosCentavos(this.db, String(sale._id), user.empresaId);
            const total = money(sale.total);
            const status = sale.statusFinanceiro === 'cancelado' ? 'cancelado' : calcularStatusFinanceiroVenda(sale.total, pago / 100);
            views.push({ id: String(sale._id), referencia: 'Venda antiga', referenciaLegada: true, status, statusLabel: label(status), total, totalPago: pago / 100, saldoRestante: Math.max(0, dinheiroParaCentavos(sale.total) - pago) / 100 });
          }
          const paymentRecords = await this.db.model<Pagamento>(Pagamento.name).find({ vendaId: { $in: valid.map((sale) => sale._id) } }).select('_id').lean().exec();
          paymentIds = paymentRecords.map((item) => item._id);
          financeiro = available(views);
          vendaDoOrcamentoId = valid.find((sale) => sale.origemTipo === 'orcamento')?._id.toString();
          if (vendaDoOrcamentoId) pendencias.push({ codigo: 'venda_origem_orcamento', label: 'Venda ligada ao orçamento', descricao: 'Há venda vinculada ao orçamento desta entrada. Confira esse vínculo antes de criar outra venda ou registrar a retirada pela ordem.', responsavel: 'Financeiro', acaoId: `ver_venda_${vendaDoOrcamentoId}` });
        } catch { financeiro = unavailable(); paymentIds = []; }
      }
    }

    const responsaveis: AtendimentoFicha['responsaveis'] = [];
    try {
      const receiver = await this.db.model<UsuarioConsulta>(Usuario.name).findOne({ _id: recebimento.recebidoPor, empresaId }).select('nome').lean().exec();
      if (receiver) responsaveis.push({ papel: 'Recebimento', nome: receiver.nome });
      else inconsistente();
    } catch {
      pendencias.push({ codigo: 'consulta_responsaveis', label: 'Responsável não consultado', descricao: 'Não foi possível consultar o nome de quem registrou a entrada. Tente novamente.', responsavel: 'Atendimento' });
    }
    if (ordensServico.estado === 'disponivel') for (const ordem of ordensServico.itens) if (ordem.tecnico && !responsaveis.some((item) => item.papel === 'Técnico' && item.nome === ordem.tecnico)) responsaveis.push({ papel: 'Técnico', nome: ordem.tecnico });

    const linhaTempo = await this.timeline(empresaId, id, orcamentos, ordensServico, financeiro, paymentIds);
    const etapas = this.etapas(recebimento.estadoSalvamento, orcamentos, ordensServico, financeiro,
      recebimento.resultadoAtendimento, recebimento.statusDevolucao, iso(recebimento.devolucaoEm), recebimento.motivoSemReparo,
      recebimento.devolvidoParaNome, recebimento.devolucaoParaTipo, recebimento.devolucaoAutorizacaoTerceiroConfirmada);
    if (vendaDoOrcamentoId) etapas.financeiro = { codigo: 'conferir_venda_orcamento', label: 'Conferir vínculo da venda', descricao: 'A venda está ligada ao orçamento. Esse vínculo não confirma a quitação de uma venda da ordem.' };
    const proximaAcao: ProximaAcaoFicha = pendencias.some((item) => item.codigo === 'vinculos_inconsistentes')
      ? { label: 'Revisar os vínculos do atendimento', descricao: 'Confirme os registros relacionados antes de criar outro orçamento, ordem ou venda.', responsavel: 'Gerência', acaoId: 'ver_recebimento' }
      : this.nextAction(id, String(recebimento.clienteId), recebimento.estadoSalvamento, cliente, orcamentos, ordensServico, financeiro, addAction, pendencias, vendaDoOrcamentoId, recebimento.resultadoAtendimento, recebimento.statusDevolucao);
    if (orcamentos.estado === 'disponivel') for (const item of orcamentos.itens) addAction(`ver_orcamento_${item.id}`, `Abrir orçamento ${item.referencia}`, `/orcamentos/${item.id}`, E.ORCAMENTO_CONSULTAR);
    if (ordensServico.estado === 'disponivel') for (const item of ordensServico.itens) addAction(`ver_os_${item.id}`, `Abrir ordem ${item.referencia}`, `/ordens-servico/${item.id}`, E.OS_CONSULTAR);
    if (financeiro.estado === 'disponivel') for (const item of financeiro.itens) addAction(`ver_venda_${item.id}`, `Abrir venda ${item.referencia}`, `/financeiro/vendas/${item.id}`, E.VENDA_CONSULTAR);
    for (const item of pendencias) if (item.acaoId && !acoes.some((action) => action.id === item.acaoId)) delete item.acaoId;

    for (const [domain, section] of [['orcamentos', orcamentos], ['ordensServico', ordensServico], ['financeiro', financeiro], ['linhaTempo', linhaTempo]] as const) if (section.estado === 'indisponivel') pendencias.push({ codigo: `consulta_${domain}`, label: 'Consulta incompleta', descricao: section.mensagem, responsavel: 'Equipe responsável' });
    return {
      id, referencia: recebimento.numero ?? 'Entrada antiga', referenciaLegada: !recebimento.numero, atualizadoEm: new Date().toISOString(),
      recebimento: {
        id, dataRecebimento: iso(recebimento.dataRecebimento), status: recebimento.status, statusLabel: label(recebimento.status), estadoSalvamento: recebimento.estadoSalvamento,
        ...(recebimento.resultadoAtendimento ? { resultadoAtendimento: recebimento.resultadoAtendimento } : {}),
        ...(recebimento.motivoSemReparo ? { motivoSemReparo: recebimento.motivoSemReparo } : {}),
        ...(recebimento.statusDevolucao ? { statusDevolucao: recebimento.statusDevolucao } : {}),
        ...(iso(recebimento.devolucaoEm) ? { devolucaoEm: iso(recebimento.devolucaoEm) } : {}),
        ...(recebimento.devolvidoParaNome ? { devolvidoParaNome: recebimento.devolvidoParaNome } : {}),
        ...(recebimento.devolucaoParaTipo ? { devolucaoParaTipo: recebimento.devolucaoParaTipo } : {}),
        ...(recebimento.devolucaoAutorizacaoTerceiroConfirmada !== undefined ? { devolucaoAutorizacaoTerceiroConfirmada: recebimento.devolucaoAutorizacaoTerceiroConfirmada } : {}),
      },
      cliente, equipamento: { categoria: normalizarCategoriaEquipamento(recebimento.categoriaEquipamento, recebimento.tipoEquipamento), tipo: recebimento.tipoEquipamento, marca: recebimento.marca, modelo: recebimento.modelo, ...(recebimento.imeiOuSerial ? { imeiOuSerial: recebimento.imeiOuSerial } : {}) },
      responsaveis, etapas, orcamentos, ordensServico, financeiro, linhaTempo, acoesPermitidas: acoes, proximaAcao, pendencias,
    };
  }

  private etapas(entrada: string | undefined, quotes: SecaoFicha<OrcamentoFicha>, orders: SecaoFicha<OrdemFicha>, finance: SecaoFicha<VendaFicha>, resultadoAtendimento?: string, statusDevolucao?: string, devolucaoEm?: string, motivoSemReparo?: string, devolvidoParaNome?: string, devolucaoParaTipo?: string, autorizacaoTerceiroConfirmada?: boolean): AtendimentoFicha['etapas'] {
    const technical: EixoAtendimento = orders.estado !== 'disponivel' ? eixoIndisponivel(orders.estado)
      : orders.itens.length > 1 ? { codigo: 'multiplas_ordens', label: 'Mais de uma ordem vinculada', descricao: 'Confira a situação de cada ordem abaixo.' }
      : orders.itens[0] ? { codigo: orders.itens[0].status, label: label(orders.itens[0].status) } : { codigo: 'sem_os', label: 'Ordem ainda não aberta' };
    const delivery: EixoAtendimento = resultadoAtendimento === 'sem_reparo'
      ? statusDevolucao === 'devolvido'
        ? { codigo: 'devolvido_sem_reparo', label: 'Devolvido sem reparo', descricao: [
          devolvidoParaNome ? `Recebido por ${devolvidoParaNome}` : 'Recebedor registrado',
          devolucaoParaTipo === 'terceiro_autorizado' && autorizacaoTerceiroConfirmada ? 'autorização do cliente confirmada' : undefined,
          devolucaoEm ? `em ${new Date(devolucaoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : undefined,
        ].filter(Boolean).join(' · ') }
        : { codigo: 'devolucao_pendente', label: 'Devolução pendente', descricao: 'O equipamento está pronto para retirada; nenhuma venda ou taxa foi criada.' }
      : orders.estado !== 'disponivel' ? eixoIndisponivel(orders.estado)
      : orders.itens.length && orders.itens.every((item) => item.dataEntrega) ? { codigo: 'entregue', label: 'Entregue' }
      : orders.itens.some((item) => item.dataEntrega) ? { codigo: 'retirada_parcial', label: 'Há retiradas registradas em parte das ordens' }
      : { codigo: 'na_assistencia', label: 'Na assistência', descricao: 'A conclusão do serviço e a retirada são registros distintos.' };
    return {
      entrada: entrada === 'pendente_midias' ? { codigo: 'pendente_midias', label: 'Anexos da entrada pendentes' } : { codigo: 'registrada', label: 'Entrada registrada' },
      orcamento: quotes.estado !== 'disponivel' ? eixoIndisponivel(quotes.estado) : quotes.itens[0] ? { codigo: quotes.itens[0].status, label: quotes.itens[0].statusLabel, descricao: 'Situação do orçamento mais recente.' } : { codigo: 'sem_orcamento', label: 'Orçamento ainda não preparado' },
      tecnico: resultadoAtendimento === 'sem_reparo'
        ? { codigo: 'sem_reparo', label: 'Sem reparo', descricao: motivoSemReparo || 'Atendimento encerrado sem execução do reparo.' }
        : technical,
      financeiro: resultadoAtendimento === 'sem_reparo'
        ? { codigo: 'sem_cobranca', label: 'Sem cobrança', descricao: 'Nenhuma venda ou taxa foi gerada para este encerramento.' }
        : finance.estado !== 'disponivel' ? eixoIndisponivel(finance.estado) : finance.itens.length === 1 ? { codigo: finance.itens[0].status, label: finance.itens[0].statusLabel } : { codigo: finance.itens.length ? 'multiplas_vendas' : 'sem_venda', label: finance.itens.length ? 'Vendas vinculadas' : 'Venda ainda não vinculada' },
      entrega: delivery,
    };
  }

  private nextAction(id: string, clienteId: string, entrada: string | undefined, cliente: AtendimentoFicha['cliente'], quotes: SecaoFicha<OrcamentoFicha>, orders: SecaoFicha<OrdemFicha>, finance: SecaoFicha<VendaFicha>, add: (id: string, label: string, href: string, evento: EventoNegocio) => boolean, pending: PendenciaFicha[], vendaDoOrcamentoId?: string, resultadoAtendimento?: string, statusDevolucao?: string): ProximaAcaoFicha {
    const action = (actionId: string, actionLabel: string, href: string, evento: EventoNegocio, next: ProximaAcaoFicha) => {
      const allowed = add(actionId, actionLabel, href, evento);
      return allowed ? { ...next, acaoId: actionId } : next;
    };
    if (entrada === 'pendente_midias') {
      const next = { label: 'Concluir os anexos da entrada', descricao: 'Os dados já estão salvos. Reenvie os arquivos originais que faltam.', responsavel: 'Recebimento' };
      pending.push({ codigo: 'anexos_pendentes', ...next });
      return action('retomar_anexos', 'Retomar anexos', `/recebimentos/novo?retomar=${id}`, E.RECEBIMENTO_EDITAR, next);
    }
    if (resultadoAtendimento === 'sem_reparo') {
      if (statusDevolucao === 'devolvido') return { label: 'Devolução registrada', descricao: 'O equipamento foi devolvido sem gerar venda ou cobrança automática.', responsavel: 'Atendimento', acaoId: 'ver_recebimento' };
      const next = { label: 'Registrar a devolução', descricao: 'O atendimento foi encerrado sem reparo. Registre quem recebeu o equipamento para concluir a entrega, sem criar venda ou taxa.', responsavel: 'Atendimento' };
      pending.push({ codigo: 'devolucao_pendente', label: 'Devolução pendente', descricao: next.descricao, responsavel: next.responsavel, acaoId: 'registrar_devolucao' });
      return action('registrar_devolucao', 'Abrir registro de devolução', `/recebimentos/${id}`, E.RECEBIMENTO_EDITAR, next);
    }
    if (cliente.estado === 'indisponivel') return { label: 'Revisar o cliente vinculado', descricao: 'Confirme o cadastro antes de continuar este atendimento.', responsavel: 'Gerência', acaoId: 'ver_recebimento' };
    if (quotes.estado === 'indisponivel' || orders.estado === 'indisponivel') return { label: 'Verificar as consultas pendentes', descricao: 'Recarregue a ficha antes de criar outro registro. Uma falha de consulta não significa ausência de atendimento.', responsavel: 'Equipe responsável' };
    if (orders.estado === 'disponivel' && orders.itens.length) {
      if (orders.itens.length > 1) return { label: 'Conferir as ordens vinculadas', descricao: 'Há mais de uma ordem para esta entrada. Consulte cada uma antes de avançar.', responsavel: 'Gerência', acaoId: `ver_os_${orders.itens[0].id}` };
      const ordem = orders.itens[0];
      const href = `/ordens-servico/${ordem.id}`;
      if (ordem.dataEntrega) return { label: 'Retirada registrada', descricao: 'O equipamento possui registro de entrega. Consulte o histórico e os documentos da ordem.', responsavel: 'Atendimento', acaoId: `ver_os_${ordem.id}` };
      if (ordem.status === 'concluida') {
        if (finance.estado !== 'disponivel') return { label: 'Solicitar conferência financeira', descricao: finance.estado === 'sem_acesso' ? 'O serviço foi concluído. O financeiro precisa conferir o recebimento antes da retirada.' : 'Não foi possível confirmar os recebimentos. Tente novamente antes de registrar a retirada.', responsavel: 'Financeiro' };
        if (vendaDoOrcamentoId) return { label: 'Conferir a venda ligada ao orçamento', descricao: 'Existe venda vinculada ao orçamento. Confira o vínculo com a ordem antes de criar outra venda ou registrar a retirada. A quitação do orçamento não confirma a quitação de uma venda da ordem.', responsavel: 'Financeiro', acaoId: `ver_venda_${vendaDoOrcamentoId}` };
        if (!finance.itens.length) return action('gerar_venda', 'Preparar venda da ordem', `/financeiro/vendas/novo?origemTipo=ordem_servico&origemId=${ordem.id}&clienteId=${clienteId}`, E.VENDA_GERAR, { label: 'Preparar a venda vinculada', descricao: 'O serviço terminou e ainda não há venda vinculada consultável.', responsavel: 'Financeiro' });
        if (finance.itens.length > 1) return { label: 'Conferir as vendas vinculadas', descricao: 'Há mais de uma venda. Confira os registros antes de registrar a retirada.', responsavel: 'Financeiro' };
        const venda = finance.itens[0];
        if (venda.status === 'pago') return action('registrar_retirada', 'Abrir registro de retirada', href, E.OS_FINALIZAR, { label: 'Registrar a retirada', descricao: 'O serviço está concluído e os pagamentos consultados estão quitados. Confira o recebedor e registre a entrega na ordem.', responsavel: 'Atendimento' });
        if (venda.status === 'cancelado') return { label: 'Conferir a venda cancelada', descricao: 'A venda está cancelada. Solicite conferência financeira antes da retirada.', responsavel: 'Financeiro', acaoId: `ver_venda_${venda.id}` };
        pending.push({ codigo: 'saldo_pendente', label: 'Recebimento pendente', descricao: 'Ainda há saldo a receber na venda vinculada.', responsavel: 'Financeiro', acaoId: 'registrar_pagamento' });
        return action('registrar_pagamento', 'Registrar recebimento', `/financeiro/pagamentos/novo?vendaId=${venda.id}`, E.PAGAMENTO_REGISTRAR, { label: 'Conferir e registrar o recebimento', descricao: 'Consulte a venda vinculada e os pagamentos já registrados.', responsavel: 'Financeiro' });
      }
      if (ordem.status === 'cancelada') return { label: 'Combinar a devolução do equipamento', descricao: 'A ordem foi cancelada e não há retirada registrada. O percurso de devolução sem reparo precisa seguir a política da empresa.', responsavel: 'Atendimento', acaoId: `ver_os_${ordem.id}` };
      const situations: Record<string, [string, string, EventoNegocio]> = {
        aberta: ['Iniciar diagnóstico', 'Abrir ordem para diagnóstico', E.OS_INICIAR_DIAGNOSTICO],
        em_diagnostico: ['Registrar a avaliação e definir o reparo', 'Abrir diagnóstico', E.OS_CONSULTAR],
        aguardando_peca: ['Acompanhar a peça pendente', 'Ver pendência de peça na ordem', E.OS_CONSULTAR],
        em_execucao: ['Conferir o reparo e registrar a conclusão', 'Abrir execução da ordem', E.OS_CONSULTAR],
      };
      const next = situations[ordem.status];
      if (next) {
        if (ordem.status === 'aguardando_peca') pending.push({ codigo: 'peca_pendente', label: 'Aguardando peça', descricao: 'A ordem está parada por espera de peça. Consulte as reservas e a reposição.', responsavel: 'Técnico / Compras', acaoId: 'acompanhar_os' });
        return action('acompanhar_os', next[1], href, next[2], { label: next[0], descricao: 'Continue pela ordem de serviço vinculada, preservando o histórico deste equipamento.', responsavel: ordem.tecnico || 'Técnico' });
      }
    }
    if (quotes.estado === 'disponivel') {
      const quote = quotes.itens[0];
      if (!quote && cliente.estado === 'disponivel') return action('preparar_orcamento', 'Preparar orçamento', `/orcamentos/novo?clienteId=${clienteId}&recebimentoId=${id}`, E.ORCAMENTO_CRIAR, { label: 'Preparar o orçamento', descricao: 'A entrada está registrada. Prepare a proposta vinculada a este equipamento.', responsavel: 'Atendimento / Técnico' });
      if (quote?.status === 'aprovado' && orders.estado === 'disponivel') return action('abrir_os_aprovada', 'Abrir orçamento aprovado para gerar a ordem', `/orcamentos/${quote.id}`, E.OS_CRIAR, { label: 'Gerar a ordem do orçamento aprovado', descricao: 'Use a geração da ordem no orçamento para preservar os vínculos.', responsavel: 'Atendimento' });
      if (quote?.status === 'enviado') { pending.push({ codigo: 'decisao_cliente', label: 'Aguardando decisão do cliente', descricao: 'O orçamento foi disponibilizado. Registre o retorno antes de iniciar o reparo.', responsavel: 'Atendimento', acaoId: `ver_orcamento_${quote.id}` }); return { label: 'Acompanhar a decisão do cliente', descricao: 'Aprovação e recusa são registradas no orçamento vinculado.', responsavel: 'Atendimento', acaoId: `ver_orcamento_${quote.id}` }; }
      if (quote?.status === 'rascunho') return { label: 'Revisar e disponibilizar o orçamento', descricao: 'Confira os itens e valores na proposta vinculada antes de enviá-la ao cliente.', responsavel: 'Atendimento', acaoId: `ver_orcamento_${quote.id}` };
      if (quote) return { label: 'Combinar a continuidade ou devolução', descricao: 'Consulte a decisão registrada no orçamento. Não há ordem de serviço vinculada consultável.', responsavel: 'Atendimento', acaoId: `ver_orcamento_${quote.id}` };
    }
    return { label: 'Consultar o responsável pela próxima etapa', descricao: 'Seu perfil pode acompanhar esta entrada. A continuidade depende do papel autorizado para a etapa seguinte.', responsavel: 'Atendimento' };
  }

  private async timeline(empresaId: Types.ObjectId, receiptId: string, quotes: SecaoFicha<OrcamentoFicha>, orders: SecaoFicha<OrdemFicha>, finance: SecaoFicha<VendaFicha>, paymentIds: Types.ObjectId[]): Promise<SecaoFicha<EventoFicha>> {
    try {
      const scopes: Record<string, unknown>[] = [{ entidade: 'recebimento', entidadeId: new Types.ObjectId(receiptId), tipoEvento: { $in: ['RECEBIMENTO_CRIADO', 'RECEBIMENTO_ATUALIZADO', 'RECEBIMENTO_REMOVIDO', 'TERMO_GERADO', 'RECEBIMENTO_SEM_REPARO', 'RECEBIMENTO_DEVOLUCAO_REGISTRADA'] } }];
      if (quotes.estado === 'disponivel') scopes.push({ entidade: 'orcamento', entidadeId: { $in: quotes.itens.map((item) => new Types.ObjectId(item.id)) }, tipoEvento: { $in: ['ORCAMENTO_CRIADO', 'ORCAMENTO_ATUALIZADO', 'ORCAMENTO_ENVIADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO', 'ORCAMENTO_CANCELADO'] } });
      if (orders.estado === 'disponivel') scopes.push({ entidade: 'ordem_servico', entidadeId: { $in: orders.itens.map((item) => new Types.ObjectId(item.id)) }, tipoEvento: { $in: ['OS_CRIADA', 'OS_STATUS_ALTERADO', 'OS_ENTREGA_ASSINADA', 'PECA_RESERVADA', 'PECA_CONSUMIDA'] } });
      if (finance.estado === 'disponivel') {
        scopes.push({ entidade: 'venda', entidadeId: { $in: finance.itens.map((item) => new Types.ObjectId(item.id)) }, tipoEvento: { $in: ['VENDA_GERADA', 'VENDA_ATUALIZADA', 'VENDA_REMOVIDA'] } });
        scopes.push({ entidade: 'pagamento', entidadeId: { $in: paymentIds }, tipoEvento: { $in: ['PAGAMENTO_REGISTRADO', 'PAGAMENTO_ATUALIZADO', 'PAGAMENTO_REMOVIDO'] } });
      }
      const events = await this.db.model<LogEvento>(LogEvento.name).find({ empresaId, $or: scopes }).select('_id data usuarioId entidade tipoEvento').sort({ data: -1, _id: -1 }).limit(100).lean().exec();
      const people = await this.db.model<UsuarioConsulta>(Usuario.name).find({ empresaId, _id: { $in: events.map((item) => item.usuarioId) } }).select('_id nome').lean().exec();
      return available(events.map((item) => ({ id: String(item._id), data: iso(item.data), titulo: eventTitles[item.tipoEvento] || 'Atendimento atualizado', dominio: item.entidade, ator: people.find((person) => String(person._id) === String(item.usuarioId))?.nome || 'Equipe' })));
    } catch { return unavailable(); }
  }
}
