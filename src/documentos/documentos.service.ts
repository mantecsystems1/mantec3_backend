import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from '../clientes/schemas/cliente.schema';
import { Empresa, EmpresaDocument } from '../core/empresa/schemas/empresa.schema';
import { Pagamento, PagamentoDocument } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { Venda, VendaDocument } from '../financeiro/vendas/schemas/venda.schema';
import { ItensVenda, ItensVendaDocument } from '../financeiro/vendas/schemas/itens-venda.schema';
import { Orcamento, OrcamentoDocument } from '../orcamentos/schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from '../orcamentos/schemas/itens-orcamento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from '../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { TermosRecebimento, TermosRecebimentoDocument } from '../recebimento/termos/termos-recebimento.schema';
import { SimplePdfBuilder } from './simple-pdf';

@Injectable()
export class DocumentosService {
  constructor(
    @InjectModel(Empresa.name) private readonly empresaModel: Model<EmpresaDocument>,
    @InjectModel(Cliente.name) private readonly clienteModel: Model<ClienteDocument>,
    @InjectModel(Orcamento.name) private readonly orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private readonly itensOrcamentoModel: Model<ItensOrcamentoDocument>,
    @InjectModel(Venda.name) private readonly vendaModel: Model<VendaDocument>,
    @InjectModel(ItensVenda.name) private readonly itensVendaModel: Model<ItensVendaDocument>,
    @InjectModel(Pagamento.name) private readonly pagamentoModel: Model<PagamentoDocument>,
    @InjectModel(RecebimentoEquipamento.name) private readonly recebimentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(TermosRecebimento.name) private readonly termoModel: Model<TermosRecebimentoDocument>,
  ) {}

  async gerarOrcamentoPdf(id: string) {
    const orcamento = await this.orcamentoModel.findById(id).lean().exec();
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

  async gerarReciboPdf(id: string) {
    const venda = await this.vendaModel.findById(id).lean().exec();
    if (!venda) throw new NotFoundException('Venda nao encontrada.');

    const [empresa, cliente, itens, pagamentos] = await Promise.all([
      this.empresaModel.findById(venda.empresaId).lean().exec(),
      this.clienteModel.findById(venda.clienteId).lean().exec(),
      this.itensVendaModel.find({ vendaId: venda._id }).lean().exec(),
      this.pagamentoModel.find({ vendaId: venda._id }).lean().exec(),
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
    return pdf.build();
  }

  async gerarTermoPdf(id: string) {
    const recebimento = await this.recebimentoModel.findById(id).lean().exec();
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
    pdf.addKeyValue('Metodo', termo?.metodoAssinatura || '-');
    pdf.addKeyValue('Data', this.formatDate(termo?.dataAssinatura));
    pdf.addLine('Assinatura do cliente: ________________________________________________');
    return pdf.build();
  }

  private criarBase(titulo: string, empresa: any, cliente: any) {
    const pdf = new SimplePdfBuilder();
    pdf.addTitle(titulo);
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

  private formatDate(value: unknown) {
    return value ? new Date(String(value)).toLocaleDateString('pt-BR') : '-';
  }

  private formatMoney(value: unknown) {
    const raw = value && typeof value === 'object' && '$numberDecimal' in value
      ? (value as { $numberDecimal?: string }).$numberDecimal
      : value;
    const amount = Number(raw ?? 0);
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
