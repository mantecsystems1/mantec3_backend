import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { TermosRecebimento, TermosRecebimentoDocument } from './termos-recebimento.schema';
import { CreateTermosRecebimentoDto } from './dto/create-termos-recebimento.dto';
import { UpdateTermosRecebimentoDto } from './dto/update-termos-recebimento.dto';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from '../recebimento-equipamento/recebimento-equipamento.schema';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TermosRecebimentoService {
  constructor(
    @InjectModel(TermosRecebimento.name) private termosRecebimentoModel: Model<TermosRecebimentoDocument>,
    @InjectModel(RecebimentoEquipamento.name) private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createTermosRecebimentoDto: CreateTermosRecebimentoDto, user?: CurrentUserPayload) {
    const createdTermosRecebimento = new this.termosRecebimentoModel(
      this.montarDadosTermo(createTermosRecebimentoDto),
    );
    const saved = await createdTermosRecebimento.save();
    await this.registrarAuditoriaTermo(saved, user, 'criado');
    return saved;
  }

  findAll() {
    return this.termosRecebimentoModel.find().exec();
  }

  findOne(id: string) {
    return this.termosRecebimentoModel.findById(id).exec();
  }

  async update(id: string, updateTermosRecebimentoDto: UpdateTermosRecebimentoDto, user?: CurrentUserPayload) {
    const updated = await this.termosRecebimentoModel
      .findByIdAndUpdate(id, this.montarDadosTermo(updateTermosRecebimentoDto), { new: true })
      .exec();

    if (updated) {
      await this.registrarAuditoriaTermo(updated, user, updateTermosRecebimentoDto.assinado ? 'assinado' : 'atualizado');
    }

    return updated;
  }

  remove(id: string) {
    return this.termosRecebimentoModel.findByIdAndDelete(id).exec();
  }

  private montarDadosTermo(dto: CreateTermosRecebimentoDto | UpdateTermosRecebimentoDto) {
    const data: Record<string, unknown> = { ...dto };
    if (typeof dto.texto === 'string') {
      data.termoHashSha256 = this.hashString(dto.texto);
    }

    if (typeof dto.assinaturaImagemBase64 === 'string' && dto.assinaturaImagemBase64.trim()) {
      data.assinaturaHashSha256 = this.hashString(dto.assinaturaImagemBase64);
    }

    if (dto.assinado && !dto.dataAssinatura) {
      data.dataAssinatura = new Date();
    }

    if (dto.dataAssinatura) {
      data.dataAssinatura = new Date(dto.dataAssinatura);
    }

    return data;
  }

  private hashString(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private async registrarAuditoriaTermo(
    termo: TermosRecebimentoDocument,
    user: CurrentUserPayload | undefined,
    operacao: string,
  ) {
    const recebimento = await this.recebimentoEquipamentoModel.findById(termo.recebimentoEquipamentoId).exec();
    if (!recebimento) {
      return;
    }

    const usuarioId = user?.id || user?._id || user?.sub || recebimento.recebidoPor?.toString();
    if (!usuarioId) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: recebimento.empresaId,
      usuarioId,
      tipoEvento: AUDITORIA_EVENTOS.TERMO_GERADO,
      entidade: AUDITORIA_ENTIDADES.RECEBIMENTO,
      entidadeId: String(recebimento._id),
      dados: {
        termoId: String(termo._id),
        clienteId: recebimento.clienteId?.toString(),
        operacao,
        assinado: termo.assinado,
        metodoAssinatura: termo.metodoAssinatura,
      },
    });
  }
}
