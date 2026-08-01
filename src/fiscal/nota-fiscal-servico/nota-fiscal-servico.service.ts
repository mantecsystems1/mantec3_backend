import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotaFiscalServico, NotaFiscalServicoDocument } from './nota-fiscal-servico.schema';
import { CreateNotaFiscalServicoDto } from './dto/create-nota-fiscal-servico.dto';
import { UpdateNotaFiscalServicoDto } from './dto/update-nota-fiscal-servico.dto';
import { Venda, VendaDocument } from '../../financeiro/vendas/schemas/venda.schema';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';

@Injectable()
export class NotaFiscalServicoService {
  constructor(
    @InjectModel(NotaFiscalServico.name) private notaFiscalServicoModel: Model<NotaFiscalServicoDocument>,
    @InjectModel(Venda.name) private vendaModel: Model<VendaDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createNotaFiscalServicoDto: CreateNotaFiscalServicoDto, actorId?: string, actorEmpresaId?: string) {
    const venda = await this.getVendaDaEmpresa(createNotaFiscalServicoDto.vendaId, actorEmpresaId);
    const createdNotaFiscalServico = new this.notaFiscalServicoModel(createNotaFiscalServicoDto);
    const saved = await createdNotaFiscalServico.save();

    if (actorId) {
      await this.registrarAuditoriaNotaFiscal(saved, venda, actorId, 'emitida');
    }

    return saved;
  }

  async findAll(empresaId?: string) {
    const query: Record<string, unknown> = {};
    if (empresaId) {
      query.vendaId = { $in: await this.getVendaIdsEmpresa(empresaId) };
    }

    return this.notaFiscalServicoModel
      .find(query)
      .populate({
        path: 'vendaId',
        populate: { path: 'clienteId', select: 'nome cpfCnpj' },
      })
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    const nota = await this.getNotaFiscalDaEmpresa(id, empresaId);
    if (!nota) {
      return null;
    }

    return this.notaFiscalServicoModel
      .findById(id)
      .populate({
        path: 'vendaId',
        populate: { path: 'clienteId', select: 'nome cpfCnpj' },
      })
      .exec();
  }

  async update(id: string, updateNotaFiscalServicoDto: UpdateNotaFiscalServicoDto, actorId?: string, actorEmpresaId?: string) {
    const nota = await this.getNotaFiscalDaEmpresa(id, actorEmpresaId);
    if (!nota) {
      throw new NotFoundException('Nota fiscal nao encontrada.');
    }

    const venda = updateNotaFiscalServicoDto.vendaId
      ? await this.getVendaDaEmpresa(updateNotaFiscalServicoDto.vendaId, actorEmpresaId)
      : await this.getVendaDaEmpresa(nota.vendaId.toString(), actorEmpresaId);

    const updated = await this.notaFiscalServicoModel.findByIdAndUpdate(id, updateNotaFiscalServicoDto, { new: true }).exec();

    if (actorId && updated) {
      await this.registrarAuditoriaNotaFiscal(updated, venda, actorId, 'atualizada');
    }

    return updated;
  }

  async remove(id: string, actorId?: string, actorEmpresaId?: string) {
    const nota = await this.getNotaFiscalDaEmpresa(id, actorEmpresaId);
    if (!nota) {
      throw new NotFoundException('Nota fiscal nao encontrada.');
    }

    const venda = await this.getVendaDaEmpresa(nota.vendaId.toString(), actorEmpresaId);
    const removed = await this.notaFiscalServicoModel.findByIdAndDelete(id).exec();

    if (actorId && removed) {
      await this.registrarAuditoriaNotaFiscal(removed, venda, actorId, 'removida');
    }

    return removed;
  }

  private async getNotaFiscalDaEmpresa(id: string, empresaId?: string) {
    const nota = await this.notaFiscalServicoModel.findById(id).exec();
    if (!nota) {
      return null;
    }

    await this.getVendaDaEmpresa(nota.vendaId.toString(), empresaId);
    return nota;
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

  private async registrarAuditoriaNotaFiscal(
    nota: NotaFiscalServicoDocument,
    venda: VendaDocument,
    actorId: string,
    operacao: 'emitida' | 'atualizada' | 'removida',
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: venda.empresaId,
      usuarioId: actorId,
      tipoEvento: this.getEventoAuditoriaNotaFiscal(operacao),
      entidade: AUDITORIA_ENTIDADES.NOTA_FISCAL,
      entidadeId: nota._id as Types.ObjectId,
      dados: {
        operacao,
        vendaId: nota.vendaId?.toString(),
        numero: nota.numero,
        status: nota.status,
      },
    });
  }

  private getEventoAuditoriaNotaFiscal(operacao: 'emitida' | 'atualizada' | 'removida') {
    if (operacao === 'atualizada') {
      return AUDITORIA_EVENTOS.NOTA_FISCAL_ATUALIZADA;
    }

    if (operacao === 'removida') {
      return AUDITORIA_EVENTOS.NOTA_FISCAL_REMOVIDA;
    }

    return AUDITORIA_EVENTOS.NOTA_FISCAL_EMITIDA;
  }
}
