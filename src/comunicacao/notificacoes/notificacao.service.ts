import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notificacao, NotificacaoDocument } from './notificacao.schema';
import { CreateNotificacaoDto } from './dto/create-notificacao.dto';
import { UpdateNotificacaoDto } from './dto/update-notificacao.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';

@Injectable()
export class NotificacaoService {
  constructor(
    @InjectModel(Notificacao.name) private notificacaoModel: Model<NotificacaoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createNotificacaoDto: CreateNotificacaoDto, user?: CurrentUserPayload): Promise<Notificacao> {
    const createdNotificacao = new this.notificacaoModel({
      ...createNotificacaoDto,
      empresaId: user?.empresaId ? new Types.ObjectId(user.empresaId) : createNotificacaoDto.empresaId,
      clienteId: createNotificacaoDto.clienteId ? new Types.ObjectId(String(createNotificacaoDto.clienteId)) : undefined,
      usuarioId: user?.id || user?._id || user?.sub,
    });
    const saved = await createdNotificacao.save();
    await this.registrarAuditoriaNotificacao(saved, user, AUDITORIA_EVENTOS.COMUNICACAO_PREPARADA, {
      operacao: 'preparada',
    });
    return saved;
  }

  async findAll(empresaId?: string): Promise<Notificacao[]> {
    const query = empresaId ? { empresaId: new Types.ObjectId(empresaId) } : {};
    return this.notificacaoModel
      .find(query)
      .populate('usuarioId', 'nome email perfil')
      .sort({ criadoEm: -1 })
      .exec();
  }

  async findByCliente(clienteId: string, empresaId?: string): Promise<Notificacao[]> {
    const query: Record<string, unknown> = { clienteId: new Types.ObjectId(clienteId) };
    if (empresaId) query.empresaId = new Types.ObjectId(empresaId);

    return this.notificacaoModel
      .find(query)
      .populate('usuarioId', 'nome email perfil')
      .sort({ criadoEm: -1 })
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    const query: Record<string, unknown> = { _id: id };
    if (empresaId) query.empresaId = new Types.ObjectId(empresaId);

    const notificacao = await this.notificacaoModel
      .findOne(query)
      .populate('usuarioId', 'nome email perfil')
      .exec();

    if (!notificacao) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    return notificacao;
  }

  async update(id: string, updateNotificacaoDto: UpdateNotificacaoDto, user?: CurrentUserPayload) {
    const query: Record<string, unknown> = { _id: id };
    const empresaId = user?.empresaId;
    if (empresaId) query.empresaId = new Types.ObjectId(empresaId);

    const updated = await this.notificacaoModel.findOneAndUpdate(query, updateNotificacaoDto, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    await this.registrarAuditoriaNotificacao(updated, user, AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA, {
      operacao: 'atualizada',
      campos: Object.keys(updateNotificacaoDto),
    });

    return updated;
  }

  async remove(id: string, empresaId?: string) {
    const query: Record<string, unknown> = { _id: id };
    if (empresaId) query.empresaId = new Types.ObjectId(empresaId);

    const removed = await this.notificacaoModel.findOneAndDelete(query).exec();
    if (!removed) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    return removed;
  }

  private async registrarAuditoriaNotificacao(
    notificacao: NotificacaoDocument,
    user: CurrentUserPayload | undefined,
    tipoEvento: typeof AUDITORIA_EVENTOS.COMUNICACAO_PREPARADA | typeof AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA,
    dados: Record<string, unknown>,
  ) {
    const usuarioId = user?.id || user?._id || user?.sub || notificacao.usuarioId?.toString();
    if (!usuarioId) {
      return;
    }

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: notificacao.empresaId,
      usuarioId,
      tipoEvento,
      entidade: AUDITORIA_ENTIDADES.NOTIFICACAO,
      entidadeId: String(notificacao._id),
      dados: {
        ...dados,
        clienteId: notificacao.clienteId?.toString(),
        tipo: notificacao.tipo,
        destino: notificacao.destino,
        status: notificacao.status,
      },
    });
  }
}
