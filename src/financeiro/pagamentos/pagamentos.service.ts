import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
import { centavosParaDecimal128, dinheiroParaCentavos } from '../financeiro-adm/financeiro-adm.types';
import { executarTransacaoFinanceira, totalPagamentosValidosCentavos, totaisPagamentosValidosPorVenda } from '../vendas/venda-pagamentos-validos';

@Injectable()
export class PagamentosService {
  constructor(
    @InjectModel(Pagamento.name) private pagamentoModel: Model<PagamentoDocument>,
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly financeiroAdmService: FinanceiroAdmService,
  ) {}

  async create(createPagamentoDto: CreatePagamentoDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaInformada(actorEmpresaId);
    return executarTransacaoFinanceira(this.pagamentoModel.db, () => this.createAtomic(createPagamentoDto, actorId, actorEmpresaId));
  }

  private async createAtomic(createPagamentoDto: CreatePagamentoDto, actorId?: string, actorEmpresaId?: string) {
    const venda = await this.getVendaDaEmpresa(createPagamentoDto.vendaId, actorEmpresaId);

    this.assertVendaPodeReceberPagamento(venda.statusFinanceiro);

    const valorPagamentoCentavos = this.parseValorCentavos(createPagamentoDto.valor, 'valor');
    if (valorPagamentoCentavos <= 0) {
      throw new BadRequestException('Valor do pagamento deve ser maior que zero.');
    }

    const totalJaPagoCentavos = await this.getTotalPagoVendaCentavos(createPagamentoDto.vendaId);
    const totalVendaCentavos = dinheiroParaCentavos(venda.total);

    if (totalJaPagoCentavos + valorPagamentoCentavos > totalVendaCentavos) {
      const restante = Math.max(totalVendaCentavos - totalJaPagoCentavos, 0) / 100;
      throw new BadRequestException(`Pagamento maior que o saldo restante da venda. Restante: R$ ${restante.toFixed(2)}. Informado: R$ ${(valorPagamentoCentavos / 100).toFixed(2)}.`);
    }

    const pagamentoData: Record<string, unknown> = { ...createPagamentoDto };
    pagamentoData.valor = centavosParaDecimal128(valorPagamentoCentavos);

    const createdPagamento = new this.pagamentoModel(pagamentoData);
    const saved = await createdPagamento.save();

    await this.sincronizarFinanceiroPagamento(saved, venda, actorId, actorEmpresaId, createPagamentoDto.contaFinanceiraId);
    await this.atualizarStatusFinanceiroVenda(createPagamentoDto.vendaId);

    if (actorId) {
      await this.registrarAuditoriaPagamento(saved, venda, actorId, 'registrado');
    }

    return saved;
  }

  async findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);

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

  async resumoPainel(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const vendas = await this.vendaModel.find({ empresaId }).select('_id total statusFinanceiro').lean().exec();
    const canceladas = vendas.filter(venda => venda.statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO);
    const emitidas = vendas.filter(venda => venda.statusFinanceiro !== VENDA_STATUS_FINANCEIRO.CANCELADO);
    const totaisPagamento = await totaisPagamentosValidosPorVenda(
      this.pagamentoModel.db,
      emitidas.map(venda => String(venda._id)),
      empresaId,
    );
    const somarCentavos = (registros: typeof vendas) => {
      const valores = registros.map(venda => dinheiroParaCentavos(venda.total));
      return valores.some(valor => !Number.isFinite(valor))
        ? null
        : valores.reduce((total, valor) => total + valor, 0);
    };

    return {
      vendasEmitidas: { quantidade: emitidas.length, totalCentavos: somarCentavos(emitidas) },
      vendasCanceladas: { quantidade: canceladas.length, totalCentavos: somarCentavos(canceladas) },
      recebimentosConfirmados: {
        vendasComRecebimento: totaisPagamento.size,
        totalCentavos: Array.from(totaisPagamento.values()).reduce((total, valor) => total + valor, 0),
      },
    };
  }

  async findOne(id: string, empresaId?: string) {
    const pagamento = await this.pagamentoModel.findById(id).exec();
    if (!pagamento) {
      return null;
    }

    this.assertEmpresaInformada(empresaId);
    if (!await this.vendaModel.exists({ _id: pagamento.vendaId, empresaId })) throw new NotFoundException('Venda nao encontrada.');
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
    this.assertEmpresaInformada(actorEmpresaId);
    return executarTransacaoFinanceira(this.pagamentoModel.db, () => this.updateAtomic(id, updatePagamentoDto, actorId, actorEmpresaId));
  }

  private async updateAtomic(id: string, updatePagamentoDto: UpdatePagamentoDto, actorId?: string, actorEmpresaId?: string) {
    const pagamento = await this.pagamentoModel.findById(id).exec();
    if (!pagamento) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }

    const vendaId = pagamento.vendaId.toString();
    const venda = await this.getVendaDaEmpresa(vendaId, actorEmpresaId);

    this.assertVendaPodeReceberPagamento(venda.statusFinanceiro, true);

    const updateData: Record<string, unknown> = { ...updatePagamentoDto };
    if (updatePagamentoDto.vendaId && updatePagamentoDto.vendaId !== vendaId) {
      throw new BadRequestException('Nao e permitido transferir pagamento para outra venda.');
    }
    if (updatePagamentoDto.valor !== undefined) {
      const novoValorCentavos = this.parseValorCentavos(updatePagamentoDto.valor, 'valor');
      if (novoValorCentavos <= 0) {
        throw new BadRequestException('Valor do pagamento deve ser maior que zero.');
      }

      const totalPagoSemPagamentoAtualCentavos = await this.getTotalPagoVendaCentavos(vendaId, id);
      const totalVendaCentavos = dinheiroParaCentavos(venda.total);
      if (totalPagoSemPagamentoAtualCentavos + novoValorCentavos > totalVendaCentavos) {
        const restante = Math.max(totalVendaCentavos - totalPagoSemPagamentoAtualCentavos, 0) / 100;
        throw new BadRequestException(`Pagamento maior que o saldo restante da venda. Restante: R$ ${restante.toFixed(2)}. Informado: R$ ${(novoValorCentavos / 100).toFixed(2)}.`);
      }

      updateData.valor = centavosParaDecimal128(novoValorCentavos);
    }

    await this.financeiroAdmService.estornarPagamentoVenda(
      pagamento,
      actorId,
      actorEmpresaId,
      'Estorno automatico para atualizacao do pagamento.',
    );

    const updated = await this.pagamentoModel.findOneAndUpdate({ _id: id, vendaId: venda._id }, updateData, { new: true }).exec();
    if (updated) {
      await this.sincronizarFinanceiroPagamento(updated, venda, actorId, actorEmpresaId, updatePagamentoDto.contaFinanceiraId);
    }
    await this.atualizarStatusFinanceiroVenda(vendaId);

    if (actorId && updated) {
      await this.registrarAuditoriaPagamento(updated, venda, actorId, 'atualizado');
    }

    return updated;
  }

  async remove(id: string, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaInformada(actorEmpresaId);
    return executarTransacaoFinanceira(this.pagamentoModel.db, () => this.removeAtomic(id, actorId, actorEmpresaId));
  }

  private async removeAtomic(id: string, actorId?: string, actorEmpresaId?: string) {
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
    const removed = await this.pagamentoModel.findOneAndDelete({ _id: id, vendaId: venda._id }).exec();
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

  private async getTotalPagoVendaCentavos(vendaId: string, ignoredPagamentoId?: string) {
    const venda = await this.vendaModel.findById(vendaId).select('empresaId').lean().exec();
    if (!venda) throw new NotFoundException('Venda nao encontrada.');
    return totalPagamentosValidosCentavos(this.pagamentoModel.db, vendaId, String(venda.empresaId), ignoredPagamentoId);
  }

  private async atualizarStatusFinanceiroVenda(vendaId: string) {
    const venda = await this.vendaModel.findById(vendaId).exec();
    if (!venda || venda.statusFinanceiro === VENDA_STATUS_FINANCEIRO.CANCELADO) {
      return;
    }

    const totalPagoCentavos = await this.getTotalPagoVendaCentavos(vendaId);
    const statusFinanceiro = calcularStatusFinanceiroVenda(venda.total, totalPagoCentavos / 100);

    await this.vendaModel.findByIdAndUpdate(vendaId, { statusFinanceiro }, { new: true }).exec();
  }

  private async getVendaDaEmpresa(vendaId: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const query: Record<string, unknown> = { _id: vendaId };
    query.empresaId = empresaId;

    // Writing the shared sale before reading payments forces concurrent transactions to retry.
    const venda = await this.vendaModel.findOneAndUpdate(query, { $inc: { __v: 1 } }, { new: true }).exec();
    if (!venda) {
      throw new NotFoundException('Venda nao encontrada.');
    }

    if (venda.statusFinanceiro !== VENDA_STATUS_FINANCEIRO.CANCELADO) {
      venda.statusFinanceiro = calcularStatusFinanceiroVenda(venda.total,
        await totalPagamentosValidosCentavos(this.pagamentoModel.db, vendaId, empresaId) / 100);
    }

    return venda;
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }

  private async getVendaIdsEmpresa(empresaId: string) {
    const vendas = await this.vendaModel.find({ empresaId }).select('_id').lean().exec();
    return vendas.map((venda) => venda._id);
  }

  private parseValorCentavos(value: unknown, campo: string) {
    const centavos = dinheiroParaCentavos(value);
    if (!Number.isFinite(centavos)) {
      throw new BadRequestException(`${campo} invalido.`);
    }

    return centavos;
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
