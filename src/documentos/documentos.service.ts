import { Injectable, NotFoundException } from '@nestjs/common';
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
    if (!orcamento) throw new NotFoundException('Orcamento nao encontrado.');

    const [empresa, cliente, itens] = await Promise.all([
      this.empresaModel.findById(orcamento.empresaId).lean().exec(),
      this.clienteModel.findById(orcamento.clienteId).lean().exec(),
      this.itensOrcamentoModel.find({ orcamentoId: orcamento._id }).lean().exec(),
    ]);

    const pdf = this.criarBase('ORCAMENTO', empresa, cliente);
    pdf.addKeyValue('Documento', this.numeroDocumento('ORC', orcamento._id));
    pdf.addKeyValue('Status', orcamento.status);
    const orcamentoRecord = orcamento as unknown as Record<string, unknown>;
    pdf.addKeyValue('Emissao', this.formatDate(orcamentoRecord.criadoEm ?? new Date()));
    pdf.addKeyValue('Validade', this.formatDate(orcamento.validade));
    pdf.addSection('Itens');
    pdf.addTable(
      ['Tipo', 'Quantidade', 'Valor unitario', 'Total'],
      itens.map((item) => [
        item.tipo,
        String(item.quantidade),
        this.formatMoney(item.valorUnitario),
        this.formatMoney(item.totalItem),
      ]),
    );
    pdf.addSection('Totais');
    pdf.addKeyValue('Subtotal', this.formatMoney(orcamento.subtotal));
    pdf.addKeyValue('Descontos', this.formatMoney(orcamento.descontos));
    pdf.addKeyValue('Total', this.formatMoney(orcamento.total));
    if (orcamento.observacoes) {
      pdf.addSection('Observacoes');
      pdf.addWrapped(String(orcamento.observacoes));
    }
    pdf.addSection('Aceite');
    pdf.addLine('Assinatura do cliente: ________________________________________________');
    return pdf.build();
  }

  async gerarReciboPdf(id: string, empresaId?: string) {
    const venda = await this.vendaModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec();
    if (!venda) throw new NotFoundException('Venda nao encontrada.');

    const [empresa, cliente, itens, pagamentos, ordemServicoEntrega] = await Promise.all([
      this.empresaModel.findById(venda.empresaId).lean().exec(),
      this.clienteModel.findById(venda.clienteId).lean().exec(),
      this.itensVendaModel.find({ vendaId: venda._id }).lean().exec(),
      this.pagamentoModel.find({ vendaId: venda._id }).lean().exec(),
      venda.origemTipo === 'ordem_servico' && venda.origemId
        ? this.ordemServicoModel.findById(venda.origemId).lean().exec()
        : Promise.resolve(null),
    ]);

    const pdf = this.criarBase('RECIBO', empresa, cliente);
    pdf.addKeyValue('Documento', this.numeroDocumento('REC', venda._id));
    pdf.addKeyValue('Origem', venda.origemTipo);
    pdf.addKeyValue('Status financeiro', venda.statusFinanceiro);
    pdf.addSection('Itens');
    pdf.addTable(
      ['Tipo', 'Quantidade', 'Valor unitario', 'Total'],
      itens.map((item) => [
        item.tipo,
        String(item.quantidade),
        this.formatMoney(item.valorUnitario),
        this.formatMoney(item.totalItem),
      ]),
    );
    pdf.addSection('Pagamentos');
    pdf.addTable(
      ['Forma', 'Data', 'Valor'],
      pagamentos.map((pagamento) => [
        pagamento.formaPagamento,
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
      throw new NotFoundException('Atendimento nao encontrado.');
    }

    if (!ordemServico && venda?.origemTipo === 'ordem_servico' && venda.origemId) {
      ordemServico = await this.ordemServicoModel.findById(venda.origemId).lean().exec();
    }

    const atendimentoEmpresaId = venda?.empresaId || ordemServico?.empresaId;
    const atendimentoClienteId = venda?.clienteId || ordemServico?.clienteId;
    const ordemServicoRecord = ordemServico as Record<string, any> | null;

    const [empresa, cliente, pagamentos, recebimento, orcamento] = await Promise.all([
      this.empresaModel.findById(atendimentoEmpresaId).lean().exec(),
      this.clienteModel.findById(atendimentoClienteId).lean().exec(),
      venda ? this.pagamentoModel.find({ vendaId: venda._id }).lean().exec() : Promise.resolve([]),
      ordemServico?.recebimentoEquipamentoId
        ? this.recebimentoModel.findById(ordemServico.recebimentoEquipamentoId).lean().exec()
        : Promise.resolve(null),
      ordemServico?.orcamentoId
        ? this.orcamentoModel.findById(ordemServico.orcamentoId).lean().exec()
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
      this.produtoModel.find({ _id: { $in: produtoIds } }).lean().exec(),
      this.servicoModel.find({ _id: { $in: servicoIds } }).lean().exec(),
    ]);
    const subtotal = venda?.subtotal ?? orcamento?.subtotal ?? 0;
    const descontos = venda?.descontos ?? orcamento?.descontos ?? 0;
    const totalAtendimento = venda?.total ?? orcamento?.total ?? 0;
    const documentoOrigemId = venda?._id || ordemServico?._id || id;

    const pdf = this.criarBase('PDF DO ATENDIMENTO', empresa, cliente);
    pdf.addKeyValue('Documento', this.numeroDocumento('ATD', documentoOrigemId));
    pdf.addKeyValue('Data de emissao', this.formatDate(new Date()));
    pdf.addKeyValue('Origem', ordemServico ? this.numeroDocumento('OS', ordemServico._id) : 'Venda direta');
    pdf.addKeyValue('Status financeiro', venda?.statusFinanceiro || 'Venda ainda nao vinculada');
    pdf.addHorizontalRule();

    if (ordemServico || recebimento) {
      pdf.addSection('Resumo do servico');
      pdf.addKeyValue('Status do servico', ordemServicoRecord?.statusOperacional || '-');
      pdf.addKeyValue('Entrada', this.formatDate(ordemServicoRecord?.dataEntrada || recebimento?.dataRecebimento));
      pdf.addKeyValue('Previsao de entrega', this.formatDate(ordemServicoRecord?.dataPrevistaEntrega));
      pdf.addKeyValue('Conclusao', this.formatDate(ordemServicoRecord?.dataConclusao));
      pdf.addKeyValue('Equipamento', recebimento ? `${recebimento.tipoEquipamento || ''} ${recebimento.marca || ''} ${recebimento.modelo || ''}`.trim() : '-');
      pdf.addKeyValue('IMEI/Serial', recebimento?.imeiOuSerial || '-');
      if (recebimento?.observacoesGerais) {
        pdf.addWrapped(`Defeito relatado: ${recebimento.observacoesGerais}`);
      }
      if (ordemServicoRecord?.diagnosticoTecnico) {
        pdf.addWrapped(`Diagnostico: ${ordemServicoRecord.diagnosticoTecnico}`);
      }
      if (ordemServicoRecord?.solucaoAplicada) {
        pdf.addWrapped(`Solucao aplicada: ${ordemServicoRecord.solucaoAplicada}`);
      }
    }

    if (orcamento) {
      pdf.addSection(orcamento.status === 'aprovado' ? 'Orcamento aprovado' : 'Orcamento vinculado');
      pdf.addKeyValue('Codigo', this.numeroDocumento('ORC', orcamento._id));
      pdf.addKeyValue('Status', orcamento.status);
      pdf.addKeyValue('Data de aprovacao', this.formatDate(orcamentoAprovadoEm));
      pdf.addKeyValue('Validade original', this.formatDate(orcamento.validade));
      pdf.addKeyValue('Valor aprovado', this.formatMoney(orcamento.total));
      if (orcamento.observacoes) {
        pdf.addWrapped(`Observacoes do orcamento: ${orcamento.observacoes}`);
      }
    }

    pdf.addSection('Produtos e servicos');
    if (itens.length) {
      pdf.addTable(
        ['Descricao', 'Tipo', 'Qtd', 'Valor', 'Total'],
        itens.map((item) => [
          this.getItemDescricao(item, produtos, servicos),
          item.tipo,
          String(item.quantidade),
          this.formatMoney(item.valorUnitario),
          this.formatMoney(item.totalItem),
        ]),
      );
    } else {
      pdf.addWrapped('Nenhum produto ou servico informado para este atendimento ate a emissao deste documento.');
    }

    pdf.addSection('Pagamento');
    if (venda && pagamentos.length) {
      pdf.addTable(
        ['Forma', 'Data', 'Valor'],
        pagamentos.map((pagamento) => [
          pagamento.formaPagamento,
          this.formatDate(pagamento.dataPagamento),
          this.formatMoney(pagamento.valor),
        ]),
      );
    } else if (!venda) {
      pdf.addWrapped('Venda ainda nao vinculada a este atendimento. Os dados financeiros finais serao consolidados quando a venda for gerada.');
    } else {
      pdf.addWrapped('Nenhum pagamento registrado para este atendimento ate a emissao deste documento.');
    }
    const totalPago = pagamentos.reduce((sum, pagamento) => sum + this.moneyToNumber(pagamento.valor), 0);
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
      pdf.addSignatureBox('Assinatura do cliente/responsavel', ordemServicoRecord.assinaturaEntregaImagemBase64);
      if (ordemServicoRecord.observacoesEntrega) {
        pdf.addWrapped(ordemServicoRecord.observacoesEntrega);
      }
    }

    pdf.addSection('Criterios de garantia');
    pdf.addWrapped('A garantia se aplica exclusivamente aos produtos e servicos descritos neste atendimento, dentro dos prazos e condicoes informados pela empresa.');
    pdf.addWrapped('A cobertura considera defeitos relacionados ao servico executado ou as pecas instaladas. Danos por queda, liquidos, mau uso, curto eletrico, intervencao de terceiros, software, virus ou condicoes externas ao servico nao sao cobertos.');
    pdf.addWrapped('Este documento centraliza o resumo do atendimento, valores, pagamentos, garantia e aceite/assinatura quando coletados.');

    return pdf.build();
  }

  async gerarTermoPdf(id: string, empresaId?: string) {
    const recebimento = await this.recebimentoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).lean().exec();
    if (!recebimento) throw new NotFoundException('Recebimento nao encontrado.');

    const [empresa, cliente, termo] = await Promise.all([
      this.empresaModel.findById(recebimento.empresaId).lean().exec(),
      this.clienteModel.findById(recebimento.clienteId).lean().exec(),
      this.termoModel.findOne({ recebimentoEquipamentoId: recebimento._id }).lean().exec(),
    ]);

    const pdf = this.criarBase('TERMO DE RECEBIMENTO', empresa, cliente);
    pdf.addKeyValue('Documento', this.numeroDocumento('TRM', recebimento._id));
    pdf.addKeyValue('Equipamento', `${recebimento.tipoEquipamento} ${recebimento.marca} ${recebimento.modelo}`);
    pdf.addKeyValue('IMEI/Serial', recebimento.imeiOuSerial || '-');
    pdf.addKeyValue('Data de recebimento', this.formatDate(recebimento.dataRecebimento));
    pdf.addKeyValue('Status', recebimento.status);
    if (recebimento.observacoesGerais) {
      pdf.addSection('Observacoes de entrada');
      pdf.addWrapped(recebimento.observacoesGerais);
    }
    pdf.addSection('Termo');
    pdf.addWrapped(termo?.texto || 'Cliente declara estar ciente das condicoes de recebimento do equipamento.');
    pdf.addSection('Assinatura');
    pdf.addKeyValue('Assinado', termo?.assinado ? 'Sim' : 'Nao');
    pdf.addKeyValue('Metodo', this.formatMetodoAssinatura(termo?.metodoAssinatura));
    pdf.addKeyValue('Signatario', termo?.signatarioNome || cliente?.nome || '-');
    pdf.addKeyValue('Documento do signatario', termo?.signatarioDocumento || cliente?.cpfCnpj || '-');
    pdf.addKeyValue('Data', this.formatDate(termo?.dataAssinatura));
    pdf.addKeyValue('IP', termo?.ipAssinatura || '-');
    pdf.addKeyValue('Hash do termo', termo?.termoHashSha256 || '-');
    pdf.addKeyValue('Hash da assinatura', termo?.assinaturaHashSha256 || '-');
    if (termo?.observacoesAssinatura) {
      pdf.addWrapped(termo.observacoesAssinatura);
    }
    pdf.addWrapped(
      termo?.assinaturaImagemBase64
        ? 'Assinatura grafica coletada no recebimento e armazenada no sistema com hash SHA-256.'
        : 'Assinatura grafica nao coletada. Aceite registrado pelos metadados acima.',
    );
    return pdf.build();
  }

  private criarBase(titulo: string, empresa: any, cliente: any) {
    const pdf = new SimplePdfBuilder();
    pdf.addTitle(titulo);
    pdf.addHorizontalRule();
    pdf.addSection('Empresa');
    pdf.addKeyValue('Nome', empresa?.nomeFantasia || empresa?.razaoSocial || '-');
    pdf.addKeyValue('CNPJ', empresa?.cnpj || '-');
    pdf.addKeyValue('Contato', `${empresa?.telefone || '-'} | ${empresa?.email || '-'}`);
    pdf.addSection('Cliente');
    pdf.addKeyValue('Nome', cliente?.nome || '-');
    pdf.addKeyValue('Documento', cliente?.cpfCnpj || '-');
    pdf.addKeyValue('Contato', `${cliente?.telefone || '-'} | ${cliente?.email || '-'}`);
    return pdf;
  }

  private numeroDocumento(prefixo: string, id: unknown) {
    return `${prefixo}-${String(id).slice(-8).toUpperCase()}`;
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

    return `${item.tipo || 'Item'} ${String(item.referenciaId || '').slice(-6).toUpperCase()}`;
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
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
    return value ? new Date(String(value)).toLocaleDateString('pt-BR') : '-';
  }

  private formatMetodoAssinatura(value?: string) {
    const labels: Record<string, string> = {
      assinatura_tela: 'Assinatura na tela',
      aceite_eletronico: 'Aceite eletronico',
      digital: 'Digital',
      manual: 'Manual',
    };

    return value ? labels[value] || value : '-';
  }

  private formatMoney(value: unknown) {
    return this.moneyToNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private moneyToNumber(value: unknown) {
    const raw = value && typeof value === 'object' && '$numberDecimal' in value
      ? (value as { $numberDecimal?: string }).$numberDecimal
      : value;
    const amount = Number(raw ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }
}
