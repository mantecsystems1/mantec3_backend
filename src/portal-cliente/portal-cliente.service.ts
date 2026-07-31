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
    private readonly orcamentosService: OrcamentosService,
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
        .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
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

    const orcamentoIds = orcamentos.map((orcamento) => orcamento._id);
    const vendaIds = vendas.map((venda) => venda._id);
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

    return {
      empresa: {
        nome: empresa.nomeFantasia || empresa.razaoSocial,
        email: empresa.email,
        telefone: empresa.telefone,
        endereco: empresa.endereco,
        horariosFuncionamento: [
          'Segunda a sexta: horario comercial',
          'Sabado: consulte atendimento',
        ],
        formasPagamento: ['Pix', 'Cartao', 'Dinheiro'],
      },
      cliente: {
        id: String(cliente._id),
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email,
      },
      orcamentos: orcamentos.map((orcamento) => ({
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
      })),
      ordensServico: ordensServico.map((ordem) => ({
        ...this.toPlain(ordem),
        id: String(ordem._id),
      })),
      vendas: vendas.map((venda) => ({
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
      })),
      garantias: garantias.map((garantia) => ({
        ...this.toPlain(garantia),
        id: String(garantia._id),
        produto: this.getRefName(garantia.produtoId),
      })),
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
