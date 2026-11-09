import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from '../clientes/schemas/cliente.schema';
import { Produto, ProdutoDocument } from '../catalogo/produtos/schemas/produto.schema';
import { Servico, ServicoDocument } from '../catalogo/servicos/schemas/servico.schema';
import { Empresa, EmpresaDocument } from '../core/empresa/schemas/empresa.schema';
import { Pagamento, PagamentoDocument } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { Venda, VendaDocument } from '../financeiro/vendas/schemas/venda.schema';
import { ItensVenda, ItensVendaDocument } from '../financeiro/vendas/schemas/itens-venda.schema';
import { Orcamento, OrcamentoDocument } from '../orcamentos/schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from '../orcamentos/schemas/itens-orcamento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from '../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { TermosRecebimento, TermosRecebimentoDocument } from '../recebimento/termos/termos-recebimento.schema';
import { OrdemServico, OrdemServicoDocument } from '../ordens-servico/schemas/ordem-servico.schema';
import { LogEvento, LogEventoDocument } from '../auditoria/schemas/log-evento.schema';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { SimplePdfBuilder } from './simple-pdf';
import { listarPagamentosValidos } from '../financeiro/vendas/venda-pagamentos-validos';
import { calcularStatusFinanceiroVenda } from '../financeiro/vendas/venda-financeiro.states';
import { dinheiroParaCentavos } from '../financeiro/financeiro-adm/financeiro-adm.types';
import { CHECKLIST_QUALIDADE_ROTULOS } from '../ordens-servico/checklist-qualidade';
import { reconstruirRevisoesChecklistQualidade, resumirRevisaoChecklistQualidade } from '../ordens-servico/checklist-qualidade-revisoes';

const statusLabel: Record<string, string> = {
  rascunho: 'Em preparação',
  enviado: 'Aguardando resposta',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  rejeitado: 'Reprovado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  entrada: 'Entrada registrada',
  aberta: 'Aberta',
  diagnostico: 'Em diagnóstico',
  em_diagnostico: 'Em diagnóstico',
  em_triagem: 'Em triagem',
  encaminhado: 'Encaminhado',
  aguardando_peca: 'Aguardando peça',
  aguardando_aprovacao: 'Aguardando aprovação',
  em_reparo: 'Serviço em execução',
  em_execucao: 'Serviço em execução',
  pronto: 'Disponível para retirada',
  entregue: 'Entregue',
  concluida: 'Disponível para retirada',
  cancelada: 'Cancelada',
  aberto: 'Em aberto',
  recebido: 'Recebido',
  pendente: 'Pendente',
  parcial: 'Pagamento parcial',
  pago: 'Pago',
  quitado: 'Quitado',
  enviada_fornecedor: 'Enviada ao fornecedor',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

const getLabel = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'Não informado';
  return statusLabel[normalized] || normalized.replace(/_/g, ' ').replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase('pt-BR'));
};

const getItemTypeLabel = (value: unknown) => ({
  produto: 'Produto',
  servico: 'Serviço',
}[String(value ?? '').trim().toLowerCase()] || 'Item');

@Injectable()
export class DocumentosService {
  constructor(
    @InjectModel(Empresa.name) private readonly empresaModel: Model<EmpresaDocument>,
    @InjectModel(Cliente.name) private readonly clienteModel: Model<ClienteDocument>,
    @InjectModel(Produto.name) private readonly produtoModel: Model<ProdutoDocument>,
    @InjectModel(Servico.name) private readonly servicoModel: Model<ServicoDocument>,
    @InjectModel(Orcamento.name) private readonly orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private readonly itensOrcamentoModel: Model<ItensOrcamentoDocument>,
    @InjectModel(Venda.name) private readonly vendaModel: Model<VendaDocument>,
    @InjectModel(ItensVenda.name) private readonly itensVendaModel: Model<ItensVendaDocument>,
    @InjectModel(Pagamento.name) private readonly pagamentoModel: Model<PagamentoDocument>,
    @InjectModel(RecebimentoEquipamento.name) private readonly recebimentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(TermosRecebimento.name) private readonly termoModel: Model<TermosRecebimentoDocument>,
    @InjectModel(OrdemServico.name) private readonly ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(LogEvento.name) private readonly logEventoModel: Model<LogEventoDocument>,
  ) {}

  async gerarOrcamentoPdf(id: string, empresaId?: string) {
    const orcamento = await this.orcamentoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec();
    if (!orcamento) throw new NotFoundException('Orçamento não encontrado.');

    const [empresa, cliente, itens] = await Promise.all([
      this.empresaModel.findById(orcamento.empresaId).lean().exec(),
      this.clienteModel.findOne({ _id: orcamento.clienteId, empresaId: orcamento.empresaId }).lean().exec(),
      this.itensOrcamentoModel.find({ orcamentoId: orcamento._id }).lean().exec(),
    ]);

    const pdf = this.criarBase('Orçamento', empresa, cliente);
    const numeroOrcamento = this.getNumeroNegocio(orcamento);
    if (numeroOrcamento) pdf.addKeyValue('Número do orçamento', `#${numeroOrcamento}`);
    pdf.addKeyValue('Situação', getLabel(orcamento.status));
    const orcamentoRecord = orcamento as unknown as Record<string, unknown>;
    pdf.addKeyValue('Emissão', this.formatDate(orcamentoRecord.criadoEm ?? new Date()));
    pdf.addKeyValue('Validade', this.formatDate(orcamento.validade));
    pdf.addSection('Itens');
    pdf.addTable(
      ['Descrição', 'Tipo', 'Qtd', 'Valor unitário', 'Total'],
      [200, 65, 40, 105, 101],
      await Promise.all(itens.map(async (item) => [
        await this.itemDescricaoDaEmpresa(item, empresaId),
        getItemTypeLabel(item.tipo),
        String(item.quantidade),
        this.formatMoney(item.valorUnitario),
        this.formatMoney(item.totalItem),
      ])),
    );
    pdf.addSection('Totais');
    pdf.addKeyValue('Subtotal', this.formatMoney(orcamento.subtotal));
    pdf.addKeyValue('Descontos', this.formatMoney(orcamento.descontos));
    pdf.addKeyValue('Total', this.formatMoney(orcamento.total));
    if (orcamento.observacoes) {
      pdf.addSection('Observações');
      pdf.addWrapped(String(orcamento.observacoes));
    }
    pdf.addSection('Aceite');
    pdf.addLine('Assinatura do cliente: ________________________________________________');
    return pdf.build();
  }

  async gerarReciboPdf(id: string, empresaId?: string) {
    const venda = await this.vendaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec();
    if (!venda) throw new NotFoundException('Venda não encontrada.');

    const [empresa, cliente, itens, pagamentos, ordemServicoEntrega] = await Promise.all([
      this.empresaModel.findById(venda.empresaId).lean().exec(),
      this.clienteModel.findOne({ _id: venda.clienteId, empresaId: venda.empresaId }).lean().exec(),
      this.itensVendaModel.find({ vendaId: venda._id }).lean().exec(),
      listarPagamentosValidos(this.pagamentoModel.db, String(venda._id), String(venda.empresaId)),
      venda.origemTipo === 'ordem_servico' && venda.origemId
        ? this.ordemServicoModel.findOne({ _id: venda.origemId, empresaId: venda.empresaId }).lean().exec()
        : Promise.resolve(null),
    ]);

    const pdf = this.criarBase('Recibo', empresa, cliente);
    const numeroVenda = this.getNumeroNegocio(venda);
    if (numeroVenda) pdf.addKeyValue('Número da venda', `#${numeroVenda}`);
    pdf.addKeyValue('Origem', venda.origemTipo === 'ordem_servico' ? 'Ordem de serviço' : 'Venda direta');
    const totalPagoCentavos = pagamentos.reduce((sum, pagamento) => sum + dinheiroParaCentavos(pagamento.valor), 0);
    pdf.addKeyValue('Situação financeira', getLabel(venda.statusFinanceiro === 'cancelado' ? 'cancelado' : calcularStatusFinanceiroVenda(venda.total, totalPagoCentavos / 100)));
    pdf.addSection('Itens');
    pdf.addTable(
      ['Descrição', 'Tipo', 'Qtd', 'Valor unitário', 'Total'],
      [200, 65, 40, 105, 101],
      await Promise.all(itens.map(async (item) => [
        await this.itemDescricaoDaEmpresa(item, empresaId),
        getItemTypeLabel(item.tipo),
        String(item.quantidade),
        this.formatMoney(item.valorUnitario),
        this.formatMoney(item.totalItem),
      ])),
    );
    pdf.addSection('Pagamentos');
    pdf.addTable(
      ['Forma', 'Data', 'Valor'],
      [250, 120, 141],
      pagamentos.map((pagamento) => [
        getLabel(pagamento.formaPagamento),
        this.formatDate(pagamento.dataPagamento),
        this.formatMoney(pagamento.valor),
      ]),
    );
    pdf.addSection('Totais');
    pdf.addKeyValue('Subtotal', this.formatMoney(venda.subtotal));
    pdf.addKeyValue('Descontos', this.formatMoney(venda.descontos));
    pdf.addKeyValue('Total', this.formatMoney(venda.total));
    if (ordemServicoEntrega?.dataEntrega || ordemServicoEntrega?.assinaturaEntregaHashSha256) {
      pdf.addSection('Entrega do equipamento');
      pdf.addKeyValue('Entregue para', ordemServicoEntrega.entregueParaNome || cliente?.nome || '-');
      pdf.addKeyValue('Documento', ordemServicoEntrega.entregueParaDocumento || cliente?.cpfCnpj || '-');
      pdf.addKeyValue('Data', this.formatDate(ordemServicoEntrega.dataEntrega));
      pdf.addKeyValue('Hash assinatura', ordemServicoEntrega.assinaturaEntregaHashSha256 || '-');
      if (ordemServicoEntrega.observacoesEntrega) {
        pdf.addWrapped(ordemServicoEntrega.observacoesEntrega);
      }
    }
    return pdf.build();
  }

  async gerarAtendimentoPdf(atendimentoId: string, empresaId?: string) {
    const { tipo, id } = this.parseAtendimentoId(atendimentoId);
    let ordemServico = tipo === 'os'
      ? await this.ordemServicoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec()
      : null;

    const venda = tipo === 'venda'
      ? await this.vendaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec()
      : await this.vendaModel.findOne(this.getEmpresaQuery(empresaId, {
          origemTipo: 'ordem_servico',
          origemId: new Types.ObjectId(id),
        })).lean().exec();

    if (!venda && !ordemServico) {
      throw new NotFoundException('Atendimento não encontrado.');
    }

    if (!ordemServico && venda?.origemTipo === 'ordem_servico' && venda.origemId) {
      ordemServico = await this.ordemServicoModel.findOne({ _id: venda.origemId, empresaId: venda.empresaId }).lean().exec();
    }

    const atendimentoEmpresaId = venda?.empresaId || ordemServico?.empresaId;
    const atendimentoClienteId = venda?.clienteId || ordemServico?.clienteId;
    const ordemServicoRecord = ordemServico as Record<string, any> | null;

    const [empresa, cliente, pagamentos, recebimento, orcamento] = await Promise.all([
      this.empresaModel.findById(atendimentoEmpresaId).lean().exec(),
      this.clienteModel.findOne({ _id: atendimentoClienteId, empresaId: atendimentoEmpresaId }).lean().exec(),
      venda ? listarPagamentosValidos(this.pagamentoModel.db, String(venda._id), String(venda.empresaId)) : Promise.resolve([]),
      ordemServico?.recebimentoEquipamentoId
        ? this.recebimentoModel.findOne({ _id: ordemServico.recebimentoEquipamentoId, empresaId: atendimentoEmpresaId }).lean().exec()
        : Promise.resolve(null),
      ordemServico?.orcamentoId
        ? this.orcamentoModel.findOne({ _id: ordemServico.orcamentoId, empresaId: atendimentoEmpresaId }).lean().exec()
        : Promise.resolve(null),
    ]);
    const orcamentoAprovadoEm = orcamento
      ? await this.getOrcamentoAprovadoEm(orcamento._id, orcamento.empresaId)
      : null;
    const itens = venda
      ? await this.itensVendaModel.find({ vendaId: venda._id }).lean().exec()
      : orcamento
        ? await this.itensOrcamentoModel.find({ orcamentoId: orcamento._id }).lean().exec()
        : [];

    const produtoIds = itens
      .filter((item) => item.tipo === 'produto' && Types.ObjectId.isValid(String(item.referenciaId)))
      .map((item) => item.referenciaId);
    const servicoIds = itens
      .filter((item) => item.tipo === 'servico' && Types.ObjectId.isValid(String(item.referenciaId)))
      .map((item) => item.referenciaId);
    const [produtos, servicos] = await Promise.all([
      this.produtoModel.find({ _id: { $in: produtoIds }, empresaId: atendimentoEmpresaId }).lean().exec(),
      this.servicoModel.find({ _id: { $in: servicoIds }, empresaId: atendimentoEmpresaId }).lean().exec(),
    ]);
    const subtotal = venda?.subtotal ?? orcamento?.subtotal ?? 0;
    const descontos = venda?.descontos ?? orcamento?.descontos ?? 0;
    const totalAtendimento = venda?.total ?? orcamento?.total ?? 0;
    const pdf = this.criarBase('Resumo do Atendimento', empresa, cliente);
    const numeroAtendimento = this.getNumeroNegocio(venda) || this.getNumeroNegocio(ordemServico);
    if (numeroAtendimento) pdf.addKeyValue('Número do atendimento', `#${numeroAtendimento}`);
    pdf.addKeyValue('Data de emissão', this.formatDate(new Date()));
    pdf.addKeyValue('Origem', ordemServico ? 'Ordem de serviço' : 'Venda direta');
    const totalPagoCentavos = pagamentos.reduce((sum, pagamento) => sum + dinheiroParaCentavos(pagamento.valor), 0);
    pdf.addKeyValue('Situação financeira', !venda ? 'Venda ainda não vinculada' : getLabel(venda.statusFinanceiro === 'cancelado' ? 'cancelado' : calcularStatusFinanceiroVenda(venda.total, totalPagoCentavos / 100)));
    pdf.addHorizontalRule();

    if (ordemServico || recebimento) {
      pdf.addSection('Resumo do serviço');
      const etapaServico = ordemServicoRecord?.dataEntrega ? 'entregue' : ordemServicoRecord?.statusOperacional;
      pdf.addKeyValue('Etapa do serviço', getLabel(etapaServico));
      pdf.addKeyValue('Entrada', this.formatDate(ordemServicoRecord?.dataEntrada || recebimento?.dataRecebimento));
      pdf.addKeyValue('Previsão de entrega', this.formatDate(ordemServicoRecord?.dataPrevistaEntrega));
      pdf.addKeyValue('Conclusão', this.formatDate(ordemServicoRecord?.dataConclusao));
      pdf.addKeyValue('Equipamento', recebimento ? `${recebimento.tipoEquipamento || ''} ${recebimento.marca || ''} ${recebimento.modelo || ''}`.trim() : '-');
      pdf.addKeyValue('IMEI/Serial', recebimento?.imeiOuSerial || '-');
      if (recebimento?.observacoesGerais) {
        pdf.addWrapped(`Defeito relatado: ${recebimento.observacoesGerais}`);
      }
      if (ordemServicoRecord?.diagnosticoTecnico) {
        pdf.addWrapped(`Diagnóstico: ${ordemServicoRecord.diagnosticoTecnico}`);
      }
      if (ordemServicoRecord?.solucaoAplicada) {
        pdf.addWrapped(`Solução aplicada: ${ordemServicoRecord.solucaoAplicada}`);
      }
    }

    if (orcamento) {
      pdf.addSection(orcamento.status === 'aprovado' ? 'Orçamento aprovado' : 'Orçamento vinculado');
      const numeroOrcamento = this.getNumeroNegocio(orcamento);
      if (numeroOrcamento) pdf.addKeyValue('Número do orçamento', `#${numeroOrcamento}`);
      pdf.addKeyValue('Situação', getLabel(orcamento.status));
      pdf.addKeyValue('Data de aprovação', this.formatDate(orcamentoAprovadoEm));
      pdf.addKeyValue('Validade original', this.formatDate(orcamento.validade));
      pdf.addKeyValue('Valor aprovado', this.formatMoney(orcamento.total));
      if (orcamento.observacoes) {
        pdf.addWrapped(`Observações do orçamento: ${orcamento.observacoes}`);
      }
    }

    pdf.addSection('Produtos e serviços');
    if (itens.length) {
      pdf.addTable(
        ['Descrição', 'Tipo', 'Qtd', 'Valor', 'Total'],
        [200, 85, 45, 90, 91],
        itens.map((item) => [
          this.getItemDescricao(item, produtos, servicos),
          getItemTypeLabel(item.tipo),
          String(item.quantidade),
          this.formatMoney(item.valorUnitario),
          this.formatMoney(item.totalItem),
        ]),
      );
    } else {
      pdf.addWrapped('Nenhum produto ou serviço informado para este atendimento até a emissão deste documento.');
    }

    pdf.addSection('Pagamento');
    if (venda && pagamentos.length) {
      pdf.addTable(
        ['Forma', 'Data', 'Valor'],
        [250, 120, 141],
        pagamentos.map((pagamento) => [
          getLabel(pagamento.formaPagamento),
          this.formatDate(pagamento.dataPagamento),
          this.formatMoney(pagamento.valor),
        ]),
      );
    } else if (!venda) {
      pdf.addWrapped('Venda ainda não vinculada a este atendimento. Os dados financeiros finais serão consolidados quando a venda for gerada.');
    } else {
      pdf.addWrapped('Nenhum pagamento registrado para este atendimento até a emissão deste documento.');
    }
    const totalPago = totalPagoCentavos / 100;
    const totalVenda = this.moneyToNumber(totalAtendimento);
    pdf.addKeyValue('Subtotal', this.formatMoney(subtotal));
    pdf.addKeyValue('Descontos', this.formatMoney(descontos));
    pdf.addKeyValue('Pago', this.formatMoney(totalPago));
    pdf.addKeyValue('Restante', this.formatMoney(Math.max(totalVenda - totalPago, 0)));
    pdf.addHighlight(venda ? 'Total do atendimento' : 'Total previsto do atendimento', this.formatMoney(totalAtendimento));

    if (ordemServicoRecord?.dataEntrega || ordemServicoRecord?.assinaturaEntregaHashSha256) {
      pdf.addSection('Retirada e assinatura');
      pdf.addKeyValue('Entregue para', ordemServicoRecord.entregueParaNome || cliente?.nome || '-');
      pdf.addKeyValue('Documento', ordemServicoRecord.entregueParaDocumento || cliente?.cpfCnpj || '-');
      pdf.addKeyValue('Data', this.formatDate(ordemServicoRecord.dataEntrega));
      pdf.addKeyValue('Hash assinatura', ordemServicoRecord.assinaturaEntregaHashSha256 || '-');
      pdf.addKeyValue('IP da assinatura', ordemServicoRecord.ipAssinaturaEntrega || '-');
      pdf.addSignatureBox('Assinatura do cliente/responsável', ordemServicoRecord.assinaturaEntregaImagemBase64);
      if (ordemServicoRecord.observacoesEntrega) {
        pdf.addWrapped(ordemServicoRecord.observacoesEntrega);
      }
    }

    pdf.addSection('Critérios de garantia');
    pdf.addWrapped('A garantia se aplica exclusivamente aos produtos e serviços descritos neste atendimento, dentro dos prazos e condições informados pela empresa.');
    pdf.addWrapped('A cobertura considera defeitos relacionados ao serviço executado ou às peças instaladas. Danos por queda, líquidos, mau uso, curto elétrico, intervenção de terceiros, software, vírus ou condições externas ao serviço não são cobertos.');
    pdf.addWrapped('Este documento centraliza o resumo do atendimento, valores, pagamentos, garantia e aceite/assinatura quando coletados.');

    return pdf.build();
  }

  async gerarTermoPdf(id: string, empresaId?: string) {
    const recebimento = await this.recebimentoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec();
    if (!recebimento) throw new NotFoundException('Recebimento não encontrado.');

    const [empresa, cliente, termo] = await Promise.all([
      this.empresaModel.findById(recebimento.empresaId).lean().exec(),
      this.clienteModel.findOne({ _id: recebimento.clienteId, empresaId: recebimento.empresaId }).lean().exec(),
      this.termoModel.findOne({ recebimentoEquipamentoId: recebimento._id }).lean().exec(),
    ]);

    const pdf = this.criarBase('Termo de Recebimento', empresa, cliente);
    pdf.addKeyValue('Equipamento', `${recebimento.tipoEquipamento} ${recebimento.marca} ${recebimento.modelo}`);
    pdf.addKeyValue('IMEI/Serial', recebimento.imeiOuSerial || '-');
    pdf.addKeyValue('Data de recebimento', this.formatDate(recebimento.dataRecebimento));
    pdf.addKeyValue('Situação', getLabel(recebimento.status));
    if (recebimento.observacoesGerais) {
      pdf.addSection('Observações de entrada');
      pdf.addWrapped(recebimento.observacoesGerais);
    }
    pdf.addSection('Termo');
    pdf.addWrapped(termo?.texto || 'Cliente declara estar ciente das condições de recebimento do equipamento.');
    pdf.addSection('Assinatura');
    pdf.addKeyValue('Assinado', termo?.assinado ? 'Sim' : 'Não');
    pdf.addKeyValue('Método', this.formatMetodoAssinatura(termo?.metodoAssinatura));
    pdf.addKeyValue('Signatário', termo?.signatarioNome || cliente?.nome || '-');
    pdf.addKeyValue('Documento do signatário', termo?.signatarioDocumento || cliente?.cpfCnpj || '-');
    pdf.addKeyValue('Data', this.formatDate(termo?.dataAssinatura));
    pdf.addKeyValue('IP', termo?.ipAssinatura || '-');
    pdf.addKeyValue('Hash do termo', termo?.termoHashSha256 || '-');
    pdf.addKeyValue('Hash da assinatura', termo?.assinaturaHashSha256 || '-');
    if (termo?.observacoesAssinatura) {
      pdf.addWrapped(termo.observacoesAssinatura);
    }
    pdf.addWrapped(
      termo?.assinaturaImagemBase64
        ? 'Assinatura gráfica coletada no recebimento e armazenada no sistema com hash SHA-256.'
        : termo?.assinado && termo?.dataAssinatura
          ? 'Assinatura gráfica não coletada. Aceite eletrônico registrado pelos metadados acima.'
          : 'Assinatura e aceite ainda não coletados.',
    );
    return pdf.build();
  }

  async listarRevisoesChecklistQualidade(id: string, empresaId?: string) {
    const ordem = await this.getOrdemServicoChecklist(id, empresaId);
    const recebimento = await this.recebimentoModel
      .findOne({ _id: ordem.recebimentoEquipamentoId, empresaId: ordem.empresaId })
      .lean()
      .exec();
    const revisoes = await this.buscarRevisoesChecklistQualidade(ordem, empresaId);
    return revisoes.map((revisao) => resumirRevisaoChecklistQualidade(
      revisao,
      ordem.categoriaEquipamento || recebimento?.categoriaEquipamento,
      recebimento?.tipoEquipamento,
    ));
  }

  async gerarChecklistQualidadePdf(id: string, revisaoSolicitada: number, empresaId?: string) {
    const ordem = await this.getOrdemServicoChecklist(id, empresaId);
    const recebimento = await this.recebimentoModel
      .findOne({ _id: ordem.recebimentoEquipamentoId, empresaId: ordem.empresaId })
      .lean()
      .exec();
    const [empresa, cliente, revisoes] = await Promise.all([
      this.empresaModel.findById(ordem.empresaId).lean().exec(),
      this.clienteModel.findOne({ _id: ordem.clienteId, empresaId: ordem.empresaId }).lean().exec(),
      this.buscarRevisoesChecklistQualidade(ordem, empresaId),
    ]);
    const revisao = revisoes.find((item) => item.revisao === revisaoSolicitada);
    if (!revisao) throw new NotFoundException('Revisão de checklist não encontrada nesta OS.');

    const resumo = resumirRevisaoChecklistQualidade(
      revisao,
      ordem.categoriaEquipamento || recebimento?.categoriaEquipamento,
      recebimento?.tipoEquipamento,
    );
    const numeroOs = this.getNumeroNegocio(ordem);
    const pdf = this.criarBase(`Checklist de qualidade · Revisão ${revisao.revisao}`, empresa, cliente);
    if (numeroOs) pdf.addKeyValue('Ordem de serviço', `#${numeroOs}`);
    pdf.addKeyValue('Revisão', String(revisao.revisao));
    pdf.addKeyValue('Situação desta revisão', resumo.situacao);
    pdf.addKeyValue('Registrada em', this.formatDateTime(revisao.data));
    pdf.addKeyValue('Responsável pelo registro', revisao.responsavel || 'Não identificado');

    if (recebimento) {
      const categoria = ordem.categoriaEquipamento || recebimento.categoriaEquipamento || 'outro';
      const rotulosCategoria: Record<string, string> = {
        celular: 'Celular ou smartphone',
        tablet: 'Tablet',
        notebook: 'Notebook ou laptop',
        desktop: 'Computador de mesa',
        outro: 'Outro equipamento eletrônico',
      };
      pdf.addKeyValue('Categoria', rotulosCategoria[categoria] || 'Outro equipamento eletrônico');
      pdf.addKeyValue('Equipamento', [recebimento.tipoEquipamento, recebimento.marca, recebimento.modelo].filter(Boolean).join(' ') || '-');
      if (recebimento.imeiOuSerial) pdf.addKeyValue('IMEI / número de série', recebimento.imeiOuSerial);
    }

    pdf.addSection('Testes registrados');
    const resultadoLabels: Record<string, string> = {
      aprovado: 'Aprovado',
      falha: 'Falha',
      nao_aplicavel: 'Não se aplica',
    };
    pdf.addTable(
      ['Teste', 'Resultado', 'Observação'],
      [177, 112, 222],
      revisao.itens.map((item) => [
        CHECKLIST_QUALIDADE_ROTULOS[item.codigo as keyof typeof CHECKLIST_QUALIDADE_ROTULOS] || item.codigo,
        resultadoLabels[item.resultado] || 'Não informado',
        item.observacao || '-',
      ]),
    );
    pdf.addKeyValue('Itens registrados', `${resumo.totalItens} de ${resumo.totalEsperado}`);
    pdf.addKeyValue('Falhas registradas', String(resumo.falhas));

    if (revisao.motivo) {
      pdf.addSection('Motivo da correção');
      pdf.addWrapped(revisao.motivo);
    }
    if (revisao.fonteIndisponivel) {
      pdf.addSection('Observação do histórico');
      pdf.addWrapped('O histórico de versões anterior não estava disponível. Este documento reproduz a versão atual registrada na ordem de serviço.');
    } else if (revisao.legado) {
      pdf.addSection('Observação do histórico');
      pdf.addWrapped('Esta revisão foi reconstruída a partir do texto de auditoria disponível. Confira a linha do tempo da OS se algum resultado parecer incompleto.');
    }

    pdf.addSection('Sobre este documento');
    pdf.addWrapped('Relatório técnico da revisão selecionada, montado a partir do histórico da ordem de serviço. Este documento é separado do comprovante de retirada e não altera nem substitui a assinatura de entrega.');
    return pdf.build();
  }

  private async getOrdemServicoChecklist(id: string, empresaId?: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Ordem de serviço inválida.');
    const ordem = await this.ordemServicoModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate({ path: 'checklistQualidadeAtualizadaPor', select: 'nome email', match: { empresaId } })
      .lean()
      .exec();
    if (!ordem) throw new NotFoundException('Ordem de serviço não encontrada.');
    return ordem;
  }

  private async buscarRevisoesChecklistQualidade(ordem: any, empresaId?: string) {
    const eventos = await this.logEventoModel
      .find(this.getEmpresaQuery(empresaId, {
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: ordem._id,
        tipoEvento: { $in: [AUDITORIA_EVENTOS.OS_CHECKLIST_QUALIDADE_ATUALIZADO, AUDITORIA_EVENTOS.OS_CHECKLIST_QUALIDADE_CORRIGIDO] },
      }))
      .populate({ path: 'usuarioId', select: 'nome email', match: { empresaId } })
      .sort({ data: 1, _id: 1 })
      .lean()
      .exec();

    return reconstruirRevisoesChecklistQualidade(eventos, {
      revisao: ordem.checklistQualidadeRevisao || (ordem.checklistQualidade?.length ? 1 : undefined),
      data: ordem.checklistQualidadeAtualizadaEm,
      responsavel: ordem.checklistQualidadeAtualizadaPor,
      categoriaEquipamento: ordem.categoriaEquipamento,
      itens: ordem.checklistQualidade,
      motivo: ordem.checklistQualidadeCorrecaoMotivo,
    });
  }

  private async itemDescricaoDaEmpresa(item: { tipo?: string; referenciaId?: unknown }, empresaId?: string) {
    const query: Record<string, unknown> = { _id: item.referenciaId, empresaId };
    const produtos = item.tipo === 'produto' ? await this.produtoModel.find(query).lean().exec() : [];
    const servicos = item.tipo === 'servico' ? await this.servicoModel.find(query).lean().exec() : [];
    return this.getItemDescricao(item, produtos, servicos);
  }

  private criarBase(titulo: string, empresa: any, cliente: any) {
    const pdf = new SimplePdfBuilder();
    pdf.addTitle(titulo);
    pdf.addHeaderBlock(empresa, cliente);
    return pdf;
  }

  private getNumeroNegocio(registro: unknown) {
    if (!registro || typeof registro !== 'object') return undefined;
    const numero = (registro as Record<string, unknown>).numero;
    if (typeof numero === 'string' && numero.trim()) return numero.trim();
    if (typeof numero === 'number' && Number.isFinite(numero)) return String(numero);
    return undefined;
  }

  private parseAtendimentoId(atendimentoId: string) {
    if (atendimentoId.startsWith('os-')) {
      return { tipo: 'os', id: atendimentoId.slice(3) };
    }

    if (atendimentoId.startsWith('venda-')) {
      return { tipo: 'venda', id: atendimentoId.slice(6) };
    }

    return { tipo: 'venda', id: atendimentoId };
  }

  private getItemDescricao(
    item: { tipo?: string; referenciaId?: unknown },
    produtos: Array<{ _id?: unknown; nome?: string; codigoInterno?: string }>,
    servicos: Array<{ _id?: unknown; nome?: string }>,
  ) {
    if (item.tipo === 'produto') {
      const produto = produtos.find((produtoItem) => String(produtoItem._id) === String(item.referenciaId));
      if (produto) {
        return produto.codigoInterno ? `${produto.nome} (${produto.codigoInterno})` : produto.nome || 'Produto';
      }
    }

    if (item.tipo === 'servico') {
      const servico = servicos.find((servicoItem) => String(servicoItem._id) === String(item.referenciaId));
      if (servico) {
        return servico.nome || 'Servico';
      }
    }

    return item.tipo === 'servico' ? 'Serviço não identificado' : 'Produto não identificado';
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }

    return { ...base, empresaId };
  }

  private async getOrcamentoAprovadoEm(orcamentoId: unknown, empresaId: unknown) {
    const query: Record<string, unknown> = {
      empresaId,
      entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
      entidadeId: orcamentoId,
      tipoEvento: AUDITORIA_EVENTOS.ORCAMENTO_APROVADO,
    };

    const log = await this.logEventoModel
      .findOne(query)
      .sort({ data: -1 })
      .lean()
      .exec();

    return log?.data;
  }

  private formatDate(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '-';
    const iso = date.toISOString();
    return date.toLocaleDateString('pt-BR', { timeZone: iso.endsWith('T00:00:00.000Z') ? 'UTC' : 'America/Sao_Paulo' });
  }

  private formatDateTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  private formatMetodoAssinatura(value?: string) {
    const labels: Record<string, string> = {
      assinatura_tela: 'Assinatura na tela',
      aceite_eletronico: 'Aceite eletrônico',
      digital: 'Digital',
      manual: 'Manual',
    };

    return value ? labels[value] || value : '-';
  }

  private formatMoney(value: unknown) {
    return this.moneyToNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
  }

  private moneyToNumber(value: unknown) {
    const raw = value && typeof value === 'object' && '$numberDecimal' in value
      ? (value as { $numberDecimal?: string }).$numberDecimal
      : value;
    const amount = Number(raw ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }
}
