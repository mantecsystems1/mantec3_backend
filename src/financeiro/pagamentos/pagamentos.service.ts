import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Pagamento, PagamentoDocument } from './schemas/pagamento.schema';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { Venda, VendaDocument } from '../vendas/schemas/venda.schema';
import { VENDA_STATUS_FINANCEIRO, calcularStatusFinanceiroVenda, decimalToNumber } from '../vendas/venda-financeiro.states';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { FinanceiroAdmService } from '../financeiro-adm/financeiro-adm.service';

@Injectable()
export class PagamentosService {
  constructor(
    @InjectModel(Pagamento.name) private pagamentoModel: Model<PagamentoDocument>,
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly financeiroAdmService: FinanceiroAdmService,
  ) {}

  async create(createPagamentoDto: CreatePagamentoDto, actorId?: string, actorEmpresaId?: string) {
    const venda = await this.getVendaDaEmpresa(createPagamentoDto.vendaId, actorEmpresaId);

    this.assertVendaPodeReceberPagamento(venda.statusFinanceiro);

    const valorPagamento = Number(createPagamentoDto.valor);
    if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) {
      throw new BadRequestException('Valor do pagamento deve ser maior que zero.');
    }

    const totalJaPago = await this.getTotalPagoVenda(createPagamentoDto.vendaId);
    const totalVenda = decimalToNumber(venda.total);

    if (totalJaPago + valorPagamento > totalVenda + 0.00001) {
      const restante = Math.max(totalVenda - totalJaPago, 0);
      throw new BadRequestException(`Pagamento maior que o saldo restante da venda. Restante: R$ ${restante.toFixed(2)}. Informado: R$ ${valorPagamento.toFixed(2)}.`);
    }

    const pagamentoData: Record<string, unknown> = { ...createPagamentoDto };
    pagamentoData.valor = Types.Decimal128.fromString(createPagamentoDto.valor);

    const createdPagamento = new this.pagamentoModel(pagamentoData);
    const saved = await createdPagamento.save();

    await this.atualizarStatusFinanceiroVenda(createPagamentoDto.vendaId);
    await this.sincronizarFinanceiroPagamento(saved, venda, actorId, actorEmpresaId, createPagamentoDto.contaFinanceiraId);

    if (actorId) {
      await this.registrarAuditoriaPagamento(saved, venda, actorId, 'registrado');
    }

    return saved;
  }

  async findAll(empresaId?: string) {
    if (!empresaId) {
      return this.pagamentoModel
        .find()
        .populate({
          path: 'vendaId',
          select: 'numero total clienteId criadoEm statusFinanceiro',
          populate: { path: 'clienteId', select: 'nome cpfCnpj email' },
        })
        .exec();
    }

    const vendaIds = await this.getVendaIdsEmpresa(empresaId);
    return this.pagamentoModel
      .find({ vendaId: { $in: vendaIds } })
      .populate({
        path: 'vendaId',
        select: 'numero total clienteId criadoEm statusFinanceiro',
        populate: { path: 'clienteId', select: 'nome cpfCnpj email' },
      })
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    const pagamento = await this.pagamentoModel.findById(id).exec();
    if (!pagamento) {
      return null;
    }

    await this.getVendaDaEmpresa(pagamento.vendaId.toString(), empresaId);
    return this.pagamentoModel
      .findById(id)
      .populate({
        path: 'vendaId',
        select: 'numero total clienteId criadoEm statusFinanceiro',
        populate: { path: 'clienteId', select: 'nome cpfCnpj email' },
      })
      .exec();
  }

  async update(id: string, updatePagamentoDto: UpdatePagamentoDto, actorId?: string, actorEmpresaId?: string) {
    const pagamento = await this.pagamentoModel.findById(id).exec();
    if (!pagamento) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    const vendaId = pagamento.vendaId.toString();
    const venda = await this.getVendaDaEmpresa(vendaId, actorEmpresaId);

    this.assertVendaPodeReceberPagamento(venda.statusFinanceiro, true);

    const updateData: Record<string, unknown> = { ...updatePagamentoDto };
    if (updatePagamentoDto.valor) {
      const novoValor = Number(updatePagamentoDto.valor);
      if (!Number.isFinite(novoValor) || novoValor <= 0) {
        throw new BadRequestException('Valor do pagamento deve ser maior que zero.');
      }

      const totalPagoSemPagamentoAtual = await this.getTotalPagoVenda(vendaId, id);
      const totalVenda = decimalToNumber(venda.total);
      if (totalPagoSemPagamentoAtual + novoValor > totalVenda + 0.00001) {
        const restante = Math.max(totalVenda - totalPagoSemPagamentoAtual, 0);
        throw new BadRequestException(`Pagamento maior que o saldo restante da venda. Restante: R$ ${restante.toFixed(2)}. Informado: R$ ${novoValor.toFixed(2)}.`);
      }

      updateData.valor = Types.Decimal128.fromString(updatePagamentoDto.valor);
    }

    await this.financeiroAdmService.estornarPagamentoVenda(
      pagamento,
      actorId,
      actorEmpresaId,
      'Estorno automatico para atualizacao do pagamento.',
    );

    const updated = await this.pagamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    await this.atualizarStatusFinanceiroVenda(vendaId);

    if (updated) {
      await this.sincronizarFinanceiroPagamento(updated, venda, actorId, actorEmpresaId, updatePagamentoDto.contaFinanceiraId);
    }

    if (actorId && updated) {
      await this.registrarAuditoriaPagamento(updated, venda, actorId, 'atualizado');
    }

    return updated;
  }

  async remove(id: string, actorId?: string, actorEmpresaId?: string) {
    const pagamento = await this.pagamentoModel.findById(id).exec();
    if (!pagamento) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    const vendaId = pagamento.vendaId.toString();
    const venda = await this.getVendaDaEmpresa(vendaId, actorEmpresaId);
    await this.financeiroAdmService.estornarPagamentoVenda(
      pagamento,
      actorId,
      actorEmpresaId,
      'Estorno automatico pela remocao do pagamento.',
    );
    const removed = await this.pagamentoModel.findByIdAndDelete(id).exec();
    await this.atualizarStatusFinanceiroVenda(vendaId);

    if (actorId && removed && venda) {
      await this.registrarAuditoriaPagamento(removed, venda, actorId, 'removido');
    }

    return removed;
  }

  private async sincronizarFinanceiroPagamento(
    pagamento: PagamentoDocument,
    venda: VendaDocument,
    actorId?: string,
    actorEmpresaId?: string,
    contaFinanceiraId?: string,
  ) {
    const financeiro = await this.financeiroAdmService.registrarPagamentoVenda(
      pagamento,
      venda,
      actorId,
      actorEmpresaId,
      contaFinanceiraId ?? pagamento.contaFinanceiraId?.toString(),
    );

    const vinculos = {
      tituloFinanceiroId: financeiro.titulo?._id,
      movimentoCaixaId: financeiro.movimento?._id,
      contaFinanceiraId: financeiro.movimento?.contaId,
    };

    await this.pagamentoModel.findByIdAndUpdate(pagamento._id, vinculos, { new: true }).exec();
    Object.assign(pagamento, vinculos);
  }

  private assertVendaPodeReceberPagamento(statusFinanceiro: string, permitePago = false) {
    if (statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO) {
      throw new BadRequestException('Venda cancelada nao pode receber pagamento.');
    }

    if (!permitePago && statusFinanceiro === VENDA_STATUS_FINANCEIRO.PAGO) {
      throw new BadRequestException('Venda ja esta paga.');
    }
  }

  private async getTotalPagoVenda(vendaId: string, ignoredPagamentoId?: string) {
    const query: Record<string, unknown> = { vendaId };
    if (ignoredPagamentoId) {
      query._id = { $ne: ignoredPagamentoId };
    }

    const pagamentos = await this.pagamentoModel.find(query).exec();
    return pagamentos.reduce((total, pagamento) => total + decimalToNumber(pagamento.valor), 0);
  }

  private async atualizarStatusFinanceiroVenda(vendaId: string) {
    const venda = await this.vendaModel.findById(vendaId).exec();
    if (!venda || venda.statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO) {
      return;
    }

    const totalPago = await this.getTotalPagoVenda(vendaId);
    const statusFinanceiro = calcularStatusFinanceiroVenda(venda.total, totalPago);

    await this.vendaModel.findByIdAndUpdate(vendaId, { statusFinanceiro }, { new: true }).exec();
  }

  private async getVendaDaEmpresa(vendaId: string, empresaId?: string) {
    const query: Record<string, unknown> = { _id: vendaId };
    if (empresaId) {
      query.empresaId = empresaId;
    }

    const venda = await this.vendaModel.findOne(query).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
    }

    return venda;
  }

  private async getVendaIdsEmpresa(empresaId: string) {
    const vendas = await this.vendaModel.find({ empresaId }).select('_id').lean().exec();
    return vendas.map((venda) => venda._id);
  }

  private async registrarAuditoriaPagamento(
    pagamento: PagamentoDocument,
    venda: VendaDocument,
    actorId: string,
    operacao: 'registrado' | 'atualizado' | 'removido',
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: venda.empresaId,
      usuarioId: actorId,
      tipoEvento: this.getEventoAuditoriaPagamento(operacao),
      entidade: AUDITORIA_ENTIDADES.PAGAMENTO,
      entidadeId: pagamento._id as Types.ObjectId,
      dados: {
        operacao,
        vendaId: pagamento.vendaId?.toString(),
        formaPagamento: pagamento.formaPagamento,
        valor: decimalToNumber(pagamento.valor),
      },
    });
  }

  private getEventoAuditoriaPagamento(operacao: 'registrado' | 'atualizado' | 'removido') {
    if (operacao === 'atualizado') {
      return AUDITORIA_EVENTOS.PAGAMENTO_ATUALIZADO;
    }

    if (operacao === 'removido') {
      return AUDITORIA_EVENTOS.PAGAMENTO_REMOVIDO;
    }

    return AUDITORIA_EVENTOS.PAGAMENTO_REGISTRADO;
  }
}
