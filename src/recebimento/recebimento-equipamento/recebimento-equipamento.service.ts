import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
    const createdRecebimentoEquipamento = new this.recebimentoEquipamentoModel(createRecebimentoEquipamentoDto);
    const saved = await createdRecebimentoEquipamento.save();

    await this.registrarAuditoriaRecebimento(saved, user, AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO, {
      operacao: 'criado',
      clienteId: createRecebimentoEquipamentoDto.clienteId,
      tipoEquipamento: createRecebimentoEquipamentoDto.tipoEquipamento,
      marca: createRecebimentoEquipamentoDto.marca,
      modelo: createRecebimentoEquipamentoDto.modelo,
      status: createRecebimentoEquipamentoDto.status,
    });

    return saved;
  }

  findAll() {
    return this.recebimentoEquipamentoModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('recebidoPor', 'nome email')
      .exec();
  }

  async findOne(id: string) {
    const recebimento = await this.recebimentoEquipamentoModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
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
    const updated = await this.recebimentoEquipamentoModel.findByIdAndUpdate(id, updateRecebimentoEquipamentoDto, { new: true }).exec();

    if (updated) {
      await this.registrarAuditoriaRecebimento(updated, user, AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO, {
        operacao: 'atualizado',
        campos: Object.keys(updateRecebimentoEquipamentoDto),
        status: updated.status,
      });
    }

    return updated;
  }

  remove(id: string) {
    return this.recebimentoEquipamentoModel.findByIdAndDelete(id).exec();
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
}
