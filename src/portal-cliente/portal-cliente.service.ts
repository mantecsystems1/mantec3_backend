import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from '../clientes/schemas/cliente.schema';
import { Empresa, EmpresaDocument } from '../core/empresa/schemas/empresa.schema';
import { Pagamento, PagamentoDocument } from '../financeiro/pagamentos/schemas/pagamento.schema';
import { Produto, ProdutoDocument } from '../catalogo/produtos/schemas/produto.schema';
import { Servico, ServicoDocument } from '../catalogo/servicos/schemas/servico.schema';
import { Venda, VendaDocument } from '../financeiro/vendas/schemas/venda.schema';
import { Garantia, GarantiaDocument } from '../garantias/schemas/garantia.schema';
import { Orcamento, OrcamentoDocument } from '../orcamentos/schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from '../orcamentos/schemas/itens-orcamento.schema';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { ORCAMENTO_STATUS } from '../orcamentos/state/orcamento.states';
import { OrdemServico, OrdemServicoDocument } from '../ordens-servico/schemas/ordem-servico.schema';
import { DocumentosService } from '../documentos/documentos.service';
import { LogEvento, LogEventoDocument } from '../auditoria/schemas/log-evento.schema';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';

type PortalTokenPayload = {
  clienteId: string;
  empresaId: string;
  exp: number;
};

const PORTAL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class PortalClienteService {
  constructor(
    @InjectModel(Cliente.name) private readonly clienteModel: Model<ClienteDocument>,
    @InjectModel(Empresa.name) private readonly empresaModel: Model<EmpresaDocument>,
    @InjectModel(Orcamento.name) private readonly orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private readonly itensOrcamentoModel: Model<ItensOrcamentoDocument>,
    @InjectModel(OrdemServico.name) private readonly ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(Venda.name) private readonly vendaModel: Model<VendaDocument>,
    @InjectModel(Pagamento.name) private readonly pagamentoModel: Model<PagamentoDocument>,
    @InjectModel(Garantia.name) private readonly garantiaModel: Model<GarantiaDocument>,
    @InjectModel(Produto.name) private readonly produtoModel: Model<ProdutoDocument>,
    @InjectModel(Servico.name) private readonly servicoModel: Model<ServicoDocument>,
    @InjectModel(LogEvento.name) private readonly logEventoModel: Model<LogEventoDocument>,
    private readonly orcamentosService: OrcamentosService,
    private readonly documentosService: DocumentosService,
    private readonly configService: ConfigService,
  ) {}

  async criarSessaoCliente(clienteId: string, empresaIdUsuario?: string) {
    if (!Types.ObjectId.isValid(clienteId)) {
      throw new BadRequestException('Cliente invalido.');
    }

    const cliente = await this.clienteModel.findById(clienteId).exec();
    if (!cliente) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    const empresaId = String(cliente.empresaId);
    if (empresaIdUsuario && empresaId !== empresaIdUsuario) {
      throw new UnauthorizedException('Cliente nao pertence a empresa do usuario.');
    }

    const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_SECONDS * 1000);
    const token = this.signToken({
      clienteId,
      empresaId,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      path: `/cliente/portal/${token}`,
    };
  }

  async getPortal(token: string) {
    const payload = this.verifyToken(token);
    const clienteObjectId = new Types.ObjectId(payload.clienteId);
    const empresaObjectId = new Types.ObjectId(payload.empresaId);

    const [empresa, cliente, orcamentos, ordensServico, vendas, garantias] = await Promise.all([
      this.empresaModel.findById(empresaObjectId).lean().exec(),
      this.clienteModel.findOne({ _id: clienteObjectId, empresaId: empresaObjectId }).lean().exec(),
      this.orcamentoModel
        .find({ clienteId: clienteObjectId, empresaId: empresaObjectId })
        .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
        .sort({ criadoEm: -1 })
        .lean()
        .exec(),
      this.ordemServicoModel
        .find({ clienteId: clienteObjectId, empresaId: empresaObjectId })
        .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial observacoesGerais')
        .sort({ criadoEm: -1 })
        .lean()
        .exec(),
      this.vendaModel
        .find({ clienteId: clienteObjectId, empresaId: empresaObjectId })
        .sort({ criadoEm: -1 })
        .lean()
        .exec(),
      this.garantiaModel
        .find({ clienteId: clienteObjectId, empresaId: empresaObjectId })
        .populate('produtoId', 'nome codigoInterno')
        .populate('fornecedorId', 'nome')
        .sort({ criadoEm: -1 })
        .lean()
        .exec(),
    ]);

    if (!cliente || !empresa) {
      throw new NotFoundException('Portal do cliente nao encontrado.');
    }

    const orcamentoIds = orcamentos.map((orcamento) => orcamento._id as Types.ObjectId);
    const ordemServicoIds = ordensServico.map((ordem) => ordem._id as Types.ObjectId);
    const vendaIds = vendas.map((venda) => venda._id as Types.ObjectId);
    const [itensOrcamento, pagamentos] = await Promise.all([
      this.itensOrcamentoModel.find({ orcamentoId: { $in: orcamentoIds } }).lean().exec(),
      this.pagamentoModel.find({ vendaId: { $in: vendaIds } }).lean().exec(),
    ]);
    const produtoIds = itensOrcamento
      .filter((item) => item.tipo === 'produto' && Types.ObjectId.isValid(String(item.referenciaId)))
      .map((item) => item.referenciaId);
    const servicoIds = itensOrcamento
      .filter((item) => item.tipo === 'servico' && Types.ObjectId.isValid(String(item.referenciaId)))
      .map((item) => item.referenciaId);
    const [produtos, servicos] = await Promise.all([
      this.produtoModel.find({ _id: { $in: produtoIds } }).lean().exec(),
      this.servicoModel.find({ _id: { $in: servicoIds } }).lean().exec(),
    ]);
    const timeline = await this.getTimelinePublica({
      empresaId: empresaObjectId,
      clienteId: clienteObjectId,
      orcamentoIds,
      ordemServicoIds,
      vendaIds,
    });
    const timelineCompleta = this.mergeTimelinePublica(
      timeline,
      this.getTimelineSintetica({ orcamentos, ordensServico, vendas, garantias }),
    );
    const portalOrcamentos = orcamentos.map((orcamento) => ({
      ...this.toPlain(orcamento),
      id: String(orcamento._id),
      total: this.decimalToNumber(orcamento.total),
      subtotal: this.decimalToNumber(orcamento.subtotal),
      descontos: this.decimalToNumber(orcamento.descontos),
      itens: itensOrcamento
        .filter((item) => String(item.orcamentoId) === String(orcamento._id))
        .map((item) => ({
          ...this.toPlain(item),
          id: String(item._id),
          descricao: this.getItemDescricao(item, produtos, servicos),
          valorUnitario: this.decimalToNumber(item.valorUnitario),
          totalItem: this.decimalToNumber(item.totalItem),
        })),
      podeDecidir: orcamento.status === ORCAMENTO_STATUS.ENVIADO,
    }));
    const portalOrdensServico = ordensServico.map((ordem) => ({
      ...this.toPlain(ordem),
      id: String(ordem._id),
      equipamento: this.getEquipamentoDescricao(ordem.recebimentoEquipamentoId),
      problemaRelatado: this.getRecebimentoObservacao(ordem.recebimentoEquipamentoId),
    }));
    const portalVendas = vendas.map((venda) => ({
      ...this.toPlain(venda),
      id: String(venda._id),
      total: this.decimalToNumber(venda.total),
      subtotal: this.decimalToNumber(venda.subtotal),
      descontos: this.decimalToNumber(venda.descontos),
      pagamentos: pagamentos
        .filter((pagamento) => String(pagamento.vendaId) === String(venda._id))
        .map((pagamento) => ({
          ...this.toPlain(pagamento),
          id: String(pagamento._id),
          valor: this.decimalToNumber(pagamento.valor),
        })),
    }));
    const portalGarantias = garantias.map((garantia) => ({
      ...this.toPlain(garantia),
      id: String(garantia._id),
      produto: this.getRefName(garantia.produtoId),
      defeitoRelatado: garantia.motivo,
      dataAbertura: garantia.criadoEm,
      dataLimite: this.getGarantiaDataLimite(garantia.criadoEm),
    }));
    const atendimentos = this.buildPortalAtendimentos({
      ordensServico: portalOrdensServico,
      vendas: portalVendas,
      orcamentos: portalOrcamentos,
      garantias: portalGarantias,
      timeline: timelineCompleta,
    });

    return {
      empresa: {
        nome: empresa.nomeFantasia || empresa.razaoSocial,
        email: empresa.email,
        telefone: empresa.telefone,
        endereco: this.formatEndereco(empresa.endereco),
        horariosFuncionamento: this.getConfigList('PORTAL_HORARIOS_FUNCIONAMENTO', [
          'Segunda a sexta: 09:00 as 18:00',
          'Sabado: 09:00 as 13:00',
        ]),
        formasPagamento: this.getConfigList('PORTAL_FORMAS_PAGAMENTO', ['Pix', 'Dinheiro', 'Cartao de debito', 'Cartao de credito']),
        orientacoesAtendimento: this.getConfigList('PORTAL_ORIENTACOES_ATENDIMENTO', [
          'Retire o equipamento somente apos confirmacao de pronto.',
          'Apresente documento ou comprovante do atendimento na retirada.',
          'Confira o equipamento no balcao antes de finalizar a entrega.',
        ]),
        politicaGarantia: this.getConfigList('PORTAL_POLITICA_GARANTIA', [
          'Garantia valida para o servico e pecas informados no recibo.',
          'Danos por queda, liquido ou mau uso nao sao cobertos.',
        ]),
      },
      cliente: {
        id: String(cliente._id),
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email,
      },
      orcamentos: portalOrcamentos,
      ordensServico: portalOrdensServico,
      vendas: portalVendas,
      garantias: portalGarantias,
      timeline: timelineCompleta,
      atendimentos,
    };
  }

  async decidirOrcamento(token: string, orcamentoId: string, decisao: 'aprovar' | 'reprovar') {
    const payload = this.verifyToken(token);
    const orcamento = await this.orcamentoModel.findOne({
      _id: new Types.ObjectId(orcamentoId),
      clienteId: new Types.ObjectId(payload.clienteId),
      empresaId: new Types.ObjectId(payload.empresaId),
    }).exec();

    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado para este cliente.');
    }

    if (orcamento.status !== ORCAMENTO_STATUS.ENVIADO) {
      throw new BadRequestException('Apenas orcamento enviado pode ser decidido pelo cliente.');
    }

    if (orcamento.validade && new Date(orcamento.validade).getTime() < Date.now()) {
      await this.orcamentosService.update(orcamentoId, { status: ORCAMENTO_STATUS.EXPIRADO });
      throw new BadRequestException('Orcamento expirado.');
    }

    const status = decisao === 'aprovar' ? ORCAMENTO_STATUS.APROVADO : ORCAMENTO_STATUS.REPROVADO;
    return this.orcamentosService.update(orcamentoId, { status });
  }

  async gerarOrcamentoPdf(token: string, orcamentoId: string) {
    const payload = this.verifyToken(token);
    await this.assertOrcamentoPertenceAoCliente(orcamentoId, payload);
    return this.documentosService.gerarOrcamentoPdf(orcamentoId);
  }

  async gerarReciboPdf(token: string, vendaId: string) {
    const payload = this.verifyToken(token);
    await this.assertVendaPertenceAoCliente(vendaId, payload);
    return this.documentosService.gerarReciboPdf(vendaId);
  }

  async gerarAtendimentoPdf(token: string, atendimentoId: string) {
    const payload = this.verifyToken(token);
    await this.assertAtendimentoPertenceAoCliente(atendimentoId, payload);
    return this.documentosService.gerarAtendimentoPdf(atendimentoId, payload.empresaId);
  }

  private signToken(payload: PortalTokenPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${this.createSignature(encodedPayload)}`;
  }

  private verifyToken(token: string): PortalTokenPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Token do portal invalido.');
    }

    const expectedSignature = this.createSignature(encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Token do portal invalido.');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PortalTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Sessao do portal expirada.');
    }

    return payload;
  }

  private createSignature(encodedPayload: string) {
    return createHmac('sha256', this.getSecret())
      .update(encodedPayload)
      .digest('base64url');
  }

  private getSecret() {
    return (
      this.configService.get<string>('PORTAL_CLIENTE_SECRET') ||
      this.configService.get<string>('AUTH_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'mantec-local-dev-secret'
    );
  }

  private decimalToNumber(value: unknown) {
    if (value && typeof value === 'object' && '$numberDecimal' in value) {
      return Number((value as { $numberDecimal?: string }).$numberDecimal ?? 0);
    }

    if (value && typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function') {
      const parsed = Number((value as { toString: () => string }).toString());
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return Number(value ?? 0);
  }

  private getItemDescricao(
    item: { tipo?: string; referenciaId?: unknown },
    produtos: Array<{ _id?: unknown; nome?: string; codigoInterno?: string }>,
    servicos: Array<{ _id?: unknown; nome?: string }>,
  ) {
    if (item.tipo === 'produto') {
      const produto = produtos.find((produtoItem) => String(produtoItem._id) === String(item.referenciaId));
      if (produto) {
        return produto.codigoInterno ? `${produto.nome} (${produto.codigoInterno})` : produto.nome;
      }
    }

    if (item.tipo === 'servico') {
      const servico = servicos.find((servicoItem) => String(servicoItem._id) === String(item.referenciaId));
      if (servico) {
        return servico.nome;
      }
    }

    return `${item.tipo || 'Item'} ${String(item.referenciaId || '').slice(-6).toUpperCase()}`;
  }

  private async assertOrcamentoPertenceAoCliente(orcamentoId: string, payload: PortalTokenPayload) {
    if (!Types.ObjectId.isValid(orcamentoId)) {
      throw new BadRequestException('Orcamento invalido.');
    }

    const orcamento = await this.orcamentoModel.findOne({
      _id: new Types.ObjectId(orcamentoId),
      clienteId: new Types.ObjectId(payload.clienteId),
      empresaId: new Types.ObjectId(payload.empresaId),
    }).lean().exec();

    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado para este cliente.');
    }
  }

  private async assertVendaPertenceAoCliente(vendaId: string, payload: PortalTokenPayload) {
    if (!Types.ObjectId.isValid(vendaId)) {
      throw new BadRequestException('Venda invalida.');
    }

    const venda = await this.vendaModel.findOne({
      _id: new Types.ObjectId(vendaId),
      clienteId: new Types.ObjectId(payload.clienteId),
      empresaId: new Types.ObjectId(payload.empresaId),
    }).lean().exec();

    if (!venda) {
      throw new NotFoundException('Recibo nao encontrado para este cliente.');
    }
  }

  private async assertAtendimentoPertenceAoCliente(atendimentoId: string, payload: PortalTokenPayload) {
    const tipo = atendimentoId.startsWith('os-') ? 'os' : 'venda';
    const id = tipo === 'os'
      ? atendimentoId.slice(3)
      : atendimentoId.startsWith('venda-')
        ? atendimentoId.slice(6)
        : atendimentoId;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Atendimento invalido.');
    }

    const empresaId = new Types.ObjectId(payload.empresaId);
    const clienteId = new Types.ObjectId(payload.clienteId);

    if (tipo === 'os') {
      const ordemServico = await this.ordemServicoModel.findOne({
        _id: new Types.ObjectId(id),
        clienteId,
        empresaId,
      }).lean().exec();
      if (!ordemServico) {
        throw new NotFoundException('Atendimento nao encontrado para este cliente.');
      }
      return;
    }

    const venda = await this.vendaModel.findOne({
      _id: new Types.ObjectId(id),
      clienteId,
      empresaId,
    }).lean().exec();
    if (!venda) {
      throw new NotFoundException('Atendimento nao encontrado para este cliente.');
    }
  }

  private buildPortalAtendimentos({
    ordensServico,
    vendas,
    orcamentos,
    garantias,
    timeline,
  }: {
    ordensServico: any[];
    vendas: any[];
    orcamentos: any[];
    garantias: any[];
    timeline: any[];
  }) {
    const usedVendaIds = new Set<string>();
    const usedGarantiaIds = new Set<string>();

    const atendimentos: any[] = ordensServico.map((ordem) => {
      const venda = vendas.find((item) =>
        item.origemTipo === 'ordem_servico' && String(item.origemId) === String(ordem.id),
      );
      if (venda) usedVendaIds.add(venda.id);

      const ordemOrcamentoId = String(ordem.orcamentoId?._id || ordem.orcamentoId || '');
      const ordemRecebimentoId = String(ordem.recebimentoEquipamentoId?._id || ordem.recebimentoEquipamentoId || '');
      const orcamentosAtendimento = orcamentos.filter((orcamento) =>
        String(orcamento.id) === ordemOrcamentoId ||
        (
          ordemRecebimentoId &&
          String(orcamento.recebimentoEquipamentoId?._id || orcamento.recebimentoEquipamentoId || '') === ordemRecebimentoId
        ),
      );
      const garantiasAtendimento = garantias.filter((garantia) =>
        (venda && String(garantia.vendaId) === String(venda.id)) ||
        String(garantia.ordemServicoId || '') === String(ordem.id),
      );
      garantiasAtendimento.forEach((garantia) => usedGarantiaIds.add(garantia.id));

      const entityIds = [
        ordem.id,
        venda?.id,
        ...orcamentosAtendimento.map((orcamento) => orcamento.id),
        ...garantiasAtendimento.map((garantia) => garantia.id),
      ].filter(Boolean).map(String);

      return {
        id: `os-${ordem.id}`,
        tipo: 'ordem_servico',
        titulo: ordem.equipamento || ordem.problemaRelatado || `Servico #${String(ordem.id).slice(-6).toUpperCase()}`,
        descricaoCurta: this.getAtendimentoDescricaoOs(ordem),
        status: ordem.statusOperacional,
        statusPublico: this.getStatusOsPublico(ordem.statusOperacional),
        dataPrincipal: ordem.dataEntrada || ordem.criadoEm,
        valorTotal: venda?.total ?? orcamentosAtendimento[0]?.total,
        pagamentoStatus: venda ? this.getPagamentoStatus(venda) : 'sem_cobranca',
        ordemServico: ordem,
        venda,
        orcamentos: orcamentosAtendimento,
        garantias: garantiasAtendimento,
        timeline: this.filterTimelineByEntities(timeline, entityIds),
      };
    });

    vendas
      .filter((venda) => !usedVendaIds.has(venda.id))
      .forEach((venda) => {
        const garantiasVenda = garantias.filter((garantia) => String(garantia.vendaId) === String(venda.id));
        garantiasVenda.forEach((garantia) => usedGarantiaIds.add(garantia.id));
        const entityIds = [venda.id, ...garantiasVenda.map((garantia) => garantia.id)].map(String);

        atendimentos.push({
          id: `venda-${venda.id}`,
          tipo: 'venda_direta',
          titulo: venda.numero ? `Venda #${venda.numero}` : `Venda #${String(venda.id).slice(-6).toUpperCase()}`,
          descricaoCurta: 'Venda direta realizada na loja.',
          status: venda.statusFinanceiro,
          statusPublico: this.getStatusPagamentoPublico(venda.statusFinanceiro),
          dataPrincipal: venda.criadoEm,
          valorTotal: venda.total,
          pagamentoStatus: this.getPagamentoStatus(venda),
          venda,
          orcamentos: [],
          garantias: garantiasVenda,
          timeline: this.filterTimelineByEntities(timeline, entityIds),
        });
      });

    garantias
      .filter((garantia) => !usedGarantiaIds.has(garantia.id))
      .forEach((garantia) => {
        atendimentos.push({
          id: `garantia-${garantia.id}`,
          tipo: 'garantia',
          titulo: garantia.produto || `Garantia #${String(garantia.id).slice(-6).toUpperCase()}`,
          descricaoCurta: garantia.defeitoRelatado || 'Garantia em acompanhamento.',
          status: garantia.status,
          statusPublico: this.getStatusGarantiaPublico(garantia.status),
          dataPrincipal: garantia.dataAbertura || garantia.criadoEm,
          pagamentoStatus: 'sem_cobranca',
          orcamentos: [],
          garantias: [garantia],
          timeline: this.filterTimelineByEntities(timeline, [garantia.id]),
        });
      });

    return atendimentos.sort((a, b) =>
      new Date(b.dataPrincipal || 0).getTime() - new Date(a.dataPrincipal || 0).getTime(),
    );
  }

  private getAtendimentoDescricaoOs(ordem: any) {
    return [
      ordem.numero ? `OS #${ordem.numero}` : `OS #${String(ordem.id).slice(-6).toUpperCase()}`,
      ordem.dataEntrada ? `Entrada ${new Date(ordem.dataEntrada).toLocaleDateString('pt-BR')}` : undefined,
      ordem.problemaRelatado,
    ].filter(Boolean).join(' | ');
  }

  private getPagamentoStatus(venda: any) {
    if (!venda) return 'sem_cobranca';
    if (venda.statusFinanceiro === 'pago') return 'pago';
    if (venda.statusFinanceiro === 'parcial') return 'parcial';
    if (venda.statusFinanceiro === 'cancelado') return 'sem_cobranca';
    return 'pendente';
  }

  private getStatusPagamentoPublico(status?: string) {
    const labels: Record<string, string> = {
      pago: 'pago',
      parcial: 'pagamento parcial',
      pendente: 'aguardando pagamento',
      cancelado: 'cancelado',
    };
    return labels[String(status || '')] || String(status || '-');
  }

  private filterTimelineByEntities(timeline: any[], entityIds: string[]) {
    const ids = new Set(entityIds.filter(Boolean).map(String));
    return timeline.filter((item) => ids.has(String(item.entidadeId)));
  }

  private async getTimelinePublica({
    empresaId,
    clienteId,
    orcamentoIds,
    ordemServicoIds,
    vendaIds,
  }: {
    empresaId: Types.ObjectId;
    clienteId: Types.ObjectId;
    orcamentoIds: Types.ObjectId[];
    ordemServicoIds: Types.ObjectId[];
    vendaIds: Types.ObjectId[];
  }) {
    const eventosPublicos = [
      AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO,
      AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO,
      AUDITORIA_EVENTOS.TERMO_GERADO,
      AUDITORIA_EVENTOS.COMUNICACAO_PREPARADA,
      AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA,
      AUDITORIA_EVENTOS.ORCAMENTO_ENVIADO,
      AUDITORIA_EVENTOS.ORCAMENTO_APROVADO,
      AUDITORIA_EVENTOS.ORCAMENTO_REPROVADO,
      AUDITORIA_EVENTOS.OS_CRIADA,
      AUDITORIA_EVENTOS.OS_STATUS_ALTERADO,
      AUDITORIA_EVENTOS.OS_ENTREGA_ASSINADA,
      AUDITORIA_EVENTOS.VENDA_GERADA,
      AUDITORIA_EVENTOS.PAGAMENTO_REGISTRADO,
      AUDITORIA_EVENTOS.GARANTIA_ABERTA,
      AUDITORIA_EVENTOS.GARANTIA_STATUS_ALTERADO,
      AUDITORIA_EVENTOS.GARANTIA_FINALIZADA,
    ];

    const entidadeQueries: Array<Record<string, unknown>> = [
      { entidade: AUDITORIA_ENTIDADES.CLIENTE, entidadeId: clienteId },
      { entidade: AUDITORIA_ENTIDADES.ORCAMENTO, entidadeId: { $in: orcamentoIds } },
      { entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO, entidadeId: { $in: ordemServicoIds } },
      { entidade: AUDITORIA_ENTIDADES.VENDA, entidadeId: { $in: vendaIds } },
      { entidade: AUDITORIA_ENTIDADES.PAGAMENTO },
      { entidade: AUDITORIA_ENTIDADES.GARANTIA },
      { entidade: AUDITORIA_ENTIDADES.RECEBIMENTO },
      { entidade: AUDITORIA_ENTIDADES.NOTIFICACAO },
    ];

    const query: Record<string, unknown> = {
        empresaId,
        tipoEvento: { $in: eventosPublicos },
        $or: entidadeQueries,
      };

    const logs = await this.logEventoModel
      .find(query)
      .sort({ data: -1 })
      .limit(40)
      .lean()
      .exec();

    return logs
      .filter((log) => this.logPertenceAoCliente(log, clienteId, orcamentoIds, ordemServicoIds, vendaIds))
      .map((log) => ({
        id: String(log._id),
        data: log.data,
        tipoEvento: log.tipoEvento,
        titulo: this.getTimelineTitulo(log.tipoEvento),
        descricao: this.getTimelineDescricao(log.tipoEvento, log.dados),
        entidade: log.entidade,
        entidadeId: String(log.entidadeId),
      }));
  }

  private getTimelineSintetica({
    orcamentos,
    ordensServico,
    vendas,
    garantias,
  }: {
    orcamentos: any[];
    ordensServico: any[];
    vendas: any[];
    garantias: any[];
  }) {
    const itens = [
      ...orcamentos.map((orcamento) => ({
        id: `orcamento-${String(orcamento._id)}`,
        data: orcamento.criadoEm || orcamento.validade,
        tipoEvento: 'PORTAL_ORCAMENTO',
        titulo: orcamento.status === ORCAMENTO_STATUS.ENVIADO ? 'Orcamento aguardando resposta' : this.getStatusOrcamentoTitulo(orcamento.status),
        descricao: `Total: ${this.formatMoney(this.decimalToNumber(orcamento.total))}.`,
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: String(orcamento._id),
      })),
      ...ordensServico.map((ordem) => ({
        id: `os-${String(ordem._id)}`,
        data: ordem.dataEntrada || ordem.criadoEm,
        tipoEvento: 'PORTAL_OS',
        titulo: 'Servico em acompanhamento',
        descricao: `Status atual: ${this.getStatusOsPublico(ordem.statusOperacional)}.`,
        entidade: AUDITORIA_ENTIDADES.ORDEM_SERVICO,
        entidadeId: String(ordem._id),
      })),
      ...vendas.map((venda) => ({
        id: `venda-${String(venda._id)}`,
        data: venda.criadoEm,
        tipoEvento: 'PORTAL_VENDA',
        titulo: 'Recibo disponivel',
        descricao: `Total: ${this.formatMoney(this.decimalToNumber(venda.total))}.`,
        entidade: AUDITORIA_ENTIDADES.VENDA,
        entidadeId: String(venda._id),
      })),
      ...garantias.map((garantia) => ({
        id: `garantia-${String(garantia._id)}`,
        data: garantia.criadoEm,
        tipoEvento: 'PORTAL_GARANTIA',
        titulo: 'Garantia registrada',
        descricao: `Status atual: ${this.getStatusGarantiaPublico(garantia.status)}.`,
        entidade: AUDITORIA_ENTIDADES.GARANTIA,
        entidadeId: String(garantia._id),
      })),
    ];

    return itens.filter((item) => item.data);
  }

  private mergeTimelinePublica(auditoria: any[], sintetica: any[]) {
    const seen = new Set<string>();
    return [...auditoria, ...sintetica]
      .filter((item) => {
        const key = `${item.entidade}:${item.entidadeId}:${item.titulo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime())
      .slice(0, 40);
  }

  private logPertenceAoCliente(
    log: { entidade?: string; entidadeId?: unknown; dados?: Record<string, unknown> },
    clienteId: Types.ObjectId,
    orcamentoIds: Types.ObjectId[],
    ordemServicoIds: Types.ObjectId[],
    vendaIds: Types.ObjectId[],
  ) {
    const entidadeId = String(log.entidadeId);
    const clienteIdText = String(clienteId);

    if (log.entidade === AUDITORIA_ENTIDADES.CLIENTE) return entidadeId === clienteIdText;
    if (log.entidade === AUDITORIA_ENTIDADES.ORCAMENTO) return orcamentoIds.some((id) => String(id) === entidadeId);
    if (log.entidade === AUDITORIA_ENTIDADES.ORDEM_SERVICO) return ordemServicoIds.some((id) => String(id) === entidadeId);
    if (log.entidade === AUDITORIA_ENTIDADES.VENDA) return vendaIds.some((id) => String(id) === entidadeId);
    if (String(log.dados?.clienteId || '') === clienteIdText) return true;
    if (log.dados?.orcamentoId && orcamentoIds.some((id) => String(id) === String(log.dados?.orcamentoId))) return true;
    if (log.dados?.vendaId && vendaIds.some((id) => String(id) === String(log.dados?.vendaId))) return true;
    return false;
  }

  private getTimelineTitulo(tipoEvento: string) {
    const labels: Record<string, string> = {
      [AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO]: 'Equipamento recebido',
      [AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO]: 'Entrada atualizada',
      [AUDITORIA_EVENTOS.TERMO_GERADO]: 'Termo gerado',
      [AUDITORIA_EVENTOS.COMUNICACAO_PREPARADA]: 'Comunicacao registrada',
      [AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA]: 'Comunicacao atualizada',
      [AUDITORIA_EVENTOS.ORCAMENTO_ENVIADO]: 'Orcamento enviado',
      [AUDITORIA_EVENTOS.ORCAMENTO_APROVADO]: 'Orcamento aprovado',
      [AUDITORIA_EVENTOS.ORCAMENTO_REPROVADO]: 'Orcamento reprovado',
      [AUDITORIA_EVENTOS.OS_CRIADA]: 'Servico iniciado',
      [AUDITORIA_EVENTOS.OS_STATUS_ALTERADO]: 'Status do servico atualizado',
      [AUDITORIA_EVENTOS.OS_ENTREGA_ASSINADA]: 'Equipamento entregue',
      [AUDITORIA_EVENTOS.VENDA_GERADA]: 'Venda gerada',
      [AUDITORIA_EVENTOS.PAGAMENTO_REGISTRADO]: 'Pagamento registrado',
      [AUDITORIA_EVENTOS.GARANTIA_ABERTA]: 'Garantia aberta',
      [AUDITORIA_EVENTOS.GARANTIA_STATUS_ALTERADO]: 'Garantia atualizada',
      [AUDITORIA_EVENTOS.GARANTIA_FINALIZADA]: 'Garantia finalizada',
    };

    return labels[tipoEvento] || 'Atualizacao registrada';
  }

  private getTimelineDescricao(tipoEvento: string, dados?: Record<string, unknown>) {
    if (tipoEvento === AUDITORIA_EVENTOS.OS_STATUS_ALTERADO) {
      return `Novo status: ${this.getStatusOsPublico(String(dados?.statusAtual || '-'))}.`;
    }

    if (tipoEvento === AUDITORIA_EVENTOS.OS_ENTREGA_ASSINADA) {
      return 'Retirada registrada com assinatura do responsavel.';
    }

    if (tipoEvento === AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO) {
      return `Entrada atualizada${dados?.status ? ` com status ${String(dados.status)}` : ''}.`;
    }

    if (tipoEvento === AUDITORIA_EVENTOS.TERMO_GERADO) {
      return dados?.assinado ? 'Termo assinado e vinculado ao atendimento.' : 'Termo vinculado ao atendimento.';
    }

    if (
      tipoEvento === AUDITORIA_EVENTOS.COMUNICACAO_PREPARADA ||
      tipoEvento === AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA
    ) {
      const tipo = dados?.tipo ? String(dados.tipo) : 'mensagem';
      return `${tipo} registrado para acompanhamento do atendimento.`;
    }

    if (tipoEvento === AUDITORIA_EVENTOS.GARANTIA_STATUS_ALTERADO) {
      return `Novo status: ${this.getStatusGarantiaPublico(String(dados?.statusAtual || dados?.status || '-'))}.`;
    }

    if (tipoEvento === AUDITORIA_EVENTOS.ORCAMENTO_APROVADO) {
      return 'O orcamento foi aprovado e pode seguir para execucao.';
    }

    if (tipoEvento === AUDITORIA_EVENTOS.ORCAMENTO_REPROVADO) {
      return 'O orcamento foi reprovado.';
    }

    if (tipoEvento === AUDITORIA_EVENTOS.PAGAMENTO_REGISTRADO) {
      return `Pagamento de ${this.formatMoney(dados?.valor)} registrado.`;
    }

    if (tipoEvento === AUDITORIA_EVENTOS.VENDA_GERADA) {
      return `Recibo gerado no valor de ${this.formatMoney(dados?.total)}.`;
    }

    return 'Atualizacao registrada no atendimento.';
  }

  private formatMoney(value: unknown) {
    return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private getConfigList(key: string, fallback: string[]) {
    const configured = this.configService.get<string>(key);
    if (!configured) {
      return fallback;
    }

    const items = configured
      .split(/[;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items : fallback;
  }

  private formatEndereco(endereco: unknown) {
    if (!endereco || typeof endereco !== 'object') {
      return undefined;
    }

    const record = endereco as Record<string, unknown>;
    return [
      record.logradouro,
      record.numero,
      record.complemento,
      record.bairro,
      record.cidade,
      record.estado,
      record.cep ? `CEP ${record.cep}` : undefined,
    ].filter(Boolean).join(', ');
  }

  private getEquipamentoDescricao(value: unknown) {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    return [record.tipoEquipamento, record.marca, record.modelo].filter(Boolean).join(' ') || undefined;
  }

  private getRecebimentoObservacao(value: unknown) {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    return typeof record.observacoesGerais === 'string' ? record.observacoesGerais : undefined;
  }

  private getGarantiaDataLimite(value: unknown) {
    if (!value) return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    date.setDate(date.getDate() + 90);
    return date.toISOString();
  }

  private getStatusOrcamentoTitulo(status?: string) {
    const labels: Record<string, string> = {
      rascunho: 'Orcamento em preparacao',
      enviado: 'Orcamento aguardando resposta',
      aprovado: 'Orcamento aprovado',
      reprovado: 'Orcamento reprovado',
      rejeitado: 'Orcamento reprovado',
      cancelado: 'Orcamento cancelado',
      expirado: 'Orcamento expirado',
    };
    return labels[String(status || '')] || 'Orcamento atualizado';
  }

  private getStatusOsPublico(status?: string) {
    const labels: Record<string, string> = {
      aberta: 'entrada registrada',
      em_diagnostico: 'em diagnostico',
      aguardando_peca: 'aguardando peca',
      em_execucao: 'em reparo',
      concluida: 'pronto para retirada',
      cancelada: 'cancelado',
      entregue: 'entregue',
    };
    return labels[String(status || '')] || String(status || '-');
  }

  private getStatusGarantiaPublico(status?: string) {
    const labels: Record<string, string> = {
      aberta: 'aberta',
      enviada_fornecedor: 'enviada ao fornecedor',
      em_analise: 'em analise',
      aprovada: 'aprovada',
      recusada: 'recusada',
      concluida: 'concluida',
    };
    return labels[String(status || '')] || String(status || '-');
  }

  private getRefName(value: unknown) {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    return String(record.nome ?? record.codigoInterno ?? record._id ?? '');
  }

  private toPlain(value: unknown) {
    return JSON.parse(JSON.stringify(value));
  }
}
