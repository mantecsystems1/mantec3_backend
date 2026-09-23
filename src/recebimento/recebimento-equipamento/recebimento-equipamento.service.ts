import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from './recebimento-equipamento.schema';
import { CreateRecebimentoEquipamentoDto } from './dto/create-recebimento-equipamento.dto';
import { UpdateRecebimentoEquipamentoDto } from './dto/update-recebimento-equipamento.dto';
import { CondicoesEquipamento, CondicoesEquipamentoDocument } from '../condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes, ComponentesAusentesDocument } from '../componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento, MidiasRecebimentoDocument } from '../midias/midias-recebimento.schema';
import { TermosRecebimento, TermosRecebimentoDocument } from '../termos/termos-recebimento.schema';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS, type AuditoriaEvento } from '../../auditoria/auditoria-eventos';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { assertTenantReference } from '../../common/tenant-reference';

@Injectable()
export class RecebimentoEquipamentoService {
  constructor(
    @InjectModel(RecebimentoEquipamento.name) private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(CondicoesEquipamento.name) private condicoesEquipamentoModel: Model<CondicoesEquipamentoDocument>,
    @InjectModel(ComponentesAusentes.name) private componentesAusentesModel: Model<ComponentesAusentesDocument>,
    @InjectModel(MidiasRecebimento.name) private midiasRecebimentoModel: Model<MidiasRecebimentoDocument>,
    @InjectModel(TermosRecebimento.name) private termosRecebimentoModel: Model<TermosRecebimentoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createRecebimentoEquipamentoDto: CreateRecebimentoEquipamentoDto, user?: CurrentUserPayload) {
    const payload = {
      ...createRecebimentoEquipamentoDto,
      empresaId: user?.empresaId ?? createRecebimentoEquipamentoDto.empresaId,
      recebidoPor: user?.id ?? createRecebimentoEquipamentoDto.recebidoPor,
    };

    this.assertEmpresaInformada(String(payload.empresaId || ''));

    if (user?.empresaId && createRecebimentoEquipamentoDto.empresaId && String(createRecebimentoEquipamentoDto.empresaId) !== user.empresaId) {
      throw new BadRequestException('Recebimento nao pode ser vinculado a outra empresa.');
    }

    await assertTenantReference(this.recebimentoEquipamentoModel.db, 'Cliente', payload.clienteId, payload.empresaId);
    const createdRecebimentoEquipamento = new this.recebimentoEquipamentoModel(payload);
    const saved = await createdRecebimentoEquipamento.save();

    await this.registrarAuditoriaRecebimento(saved, user, AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO, {
      operacao: 'criado',
      clienteId: payload.clienteId,
      tipoEquipamento: payload.tipoEquipamento,
      marca: payload.marca,
      modelo: payload.modelo,
      status: payload.status,
    });

    return saved;
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.recebimentoEquipamentoModel
      .find(this.getEmpresaQuery(empresaId))
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate('recebidoPor', 'nome email')
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const recebimento = await this.recebimentoEquipamentoModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate({ path: 'clienteId', select: 'nome cpfCnpj', match: { empresaId } })
      .populate('recebidoPor', 'nome email')
      .lean()
      .exec();

    if (!recebimento) return null;

    const [condicoes, componentesAusentes, midias, termo] = await Promise.all([
      this.condicoesEquipamentoModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.componentesAusentesModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.midiasRecebimentoModel.find({ recebimentoEquipamentoId: id }).lean().exec(),
      this.termosRecebimentoModel.findOne({ recebimentoEquipamentoId: id }).lean().exec(),
    ]);

    return {
      ...recebimento,
      condicoes,
      componentesAusentes,
      midias,
      termo,
    };
  }

  async update(id: string, updateRecebimentoEquipamentoDto: UpdateRecebimentoEquipamentoDto, user?: CurrentUserPayload) {
    this.assertEmpresaInformada(user?.empresaId);
    if (user?.empresaId && updateRecebimentoEquipamentoDto.empresaId && String(updateRecebimentoEquipamentoDto.empresaId) !== user.empresaId) {
      throw new BadRequestException('Recebimento nao pode ser movido para outra empresa.');
    }

    const updatePayload = { ...updateRecebimentoEquipamentoDto };
    delete updatePayload.empresaId;
    if (updatePayload.clienteId !== undefined) {
      await assertTenantReference(this.recebimentoEquipamentoModel.db, 'Cliente', updatePayload.clienteId, user.empresaId);
    }

    const updated = await this.recebimentoEquipamentoModel
      .findOneAndUpdate(this.getEmpresaQuery(user?.empresaId, { _id: id }), updatePayload, { new: true })
      .exec();

    if (updated) {
      await this.registrarAuditoriaRecebimento(updated, user, AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO, {
        operacao: 'atualizado',
        campos: Object.keys(updateRecebimentoEquipamentoDto),
        status: updated.status,
      });
    }

    return updated;
  }

  remove(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.recebimentoEquipamentoModel.findOneAndDelete(this.getEmpresaQuery(empresaId, { _id: id })).exec();
  }

  private async registrarAuditoriaRecebimento(
    recebimento: RecebimentoEquipamentoDocument,
    user: CurrentUserPayload | undefined,
    tipoEvento: AuditoriaEvento,
    dados: Record<string, unknown>,
  ) {
    const usuarioId = user?.id || user?._id || user?.sub || recebimento.recebidoPor?.toString();
    if (!usuarioId) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: recebimento.empresaId,
      usuarioId,
      tipoEvento,
      entidade: AUDITORIA_ENTIDADES.RECEBIMENTO,
      entidadeId: String(recebimento._id),
      dados: {
        ...dados,
        clienteId: recebimento.clienteId?.toString(),
      },
    });
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    this.assertEmpresaInformada(empresaId);
    return { ...base, empresaId: new Types.ObjectId(empresaId) };
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
