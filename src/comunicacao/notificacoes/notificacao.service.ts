import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notificacao, NotificacaoDocument } from './notificacao.schema';
import { CreateNotificacaoDto } from './dto/create-notificacao.dto';
import { UpdateNotificacaoDto } from './dto/update-notificacao.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { ConfirmarStatusManualNotificacaoDto } from './dto/confirmar-status-manual.dto';
import { assertTenantReference } from '../../common/tenant-reference';

@Injectable()
export class NotificacaoService {
  constructor(
    @InjectModel(Notificacao.name) private notificacaoModel: Model<NotificacaoDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createNotificacaoDto: CreateNotificacaoDto, user?: CurrentUserPayload): Promise<Notificacao> {
    const empresaObjectId = this.getEmpresaObjectId(user?.empresaId);
    if (createNotificacaoDto.status && createNotificacaoDto.status !== 'preparada') {
      throw new BadRequestException('Uma mensagem nova começa como preparada. Registre o resultado depois de concluir ou verificar o contato.');
    }
    if (createNotificacaoDto.clienteId) {
      const clienteId = String(createNotificacaoDto.clienteId);
      if (!Types.ObjectId.isValid(clienteId)) throw new BadRequestException('Cliente inválido para esta comunicação.');
      await assertTenantReference(this.notificacaoModel.db, 'Cliente', clienteId, empresaObjectId);
    }
    const createdNotificacao = new this.notificacaoModel({
      ...createNotificacaoDto,
      status: 'preparada',
      empresaId: empresaObjectId,
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
    const query = { empresaId: this.getEmpresaObjectId(empresaId) };
    return this.notificacaoModel
      .find(query)
      .populate('usuarioId', 'nome email perfil')
      .populate('confirmacaoStatusPor', 'nome email')
      .sort({ criadoEm: -1 })
      .exec();
  }

  async findByCliente(clienteId: string, empresaId?: string): Promise<Notificacao[]> {
    if (!Types.ObjectId.isValid(clienteId)) throw new BadRequestException('Cliente inválido.');
    const query: Record<string, unknown> = { clienteId: new Types.ObjectId(clienteId), empresaId: this.getEmpresaObjectId(empresaId) };

    return this.notificacaoModel
      .find(query)
      .populate('usuarioId', 'nome email perfil')
      .populate('confirmacaoStatusPor', 'nome email')
      .sort({ criadoEm: -1 })
      .exec();
  }

  async findOne(id: string, empresaId?: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Notificação inválida.');
    const query: Record<string, unknown> = { _id: new Types.ObjectId(id), empresaId: this.getEmpresaObjectId(empresaId) };

    const notificacao = await this.notificacaoModel
      .findOne(query)
      .populate('usuarioId', 'nome email perfil')
      .populate('confirmacaoStatusPor', 'nome email')
      .exec();

    if (!notificacao) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    return notificacao;
  }

  async update(id: string, updateNotificacaoDto: UpdateNotificacaoDto, user?: CurrentUserPayload) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Notificação inválida.');
    const query: Record<string, unknown> = { _id: new Types.ObjectId(id), empresaId: this.getEmpresaObjectId(user?.empresaId) };

    const atual = await this.notificacaoModel.findOne(query).exec();
    if (!atual) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }
    if (updateNotificacaoDto.status !== undefined && updateNotificacaoDto.status !== atual.status) {
      throw new BadRequestException('O resultado do contato não pode ser alterado diretamente. Use a confirmação manual e registre o que ocorreu.');
    }
    const updateData: Partial<Pick<Notificacao, 'tipo' | 'destino' | 'mensagem'>> = {};
    if (updateNotificacaoDto.tipo !== undefined) updateData.tipo = updateNotificacaoDto.tipo;
    if (updateNotificacaoDto.destino !== undefined) updateData.destino = updateNotificacaoDto.destino;
    if (updateNotificacaoDto.mensagem !== undefined) updateData.mensagem = updateNotificacaoDto.mensagem;
    const updated = await this.notificacaoModel.findOneAndUpdate(query, updateData, { new: true }).exec();
    if (!updated) throw new NotFoundException('Notificacao nao encontrada.');

    await this.registrarAuditoriaNotificacao(updated, user, AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA, {
      operacao: 'atualizada',
      campos: Object.keys(updateNotificacaoDto),
    });

    return updated;
  }

  async confirmarStatusManual(id: string, dto: ConfirmarStatusManualNotificacaoDto, user?: CurrentUserPayload) {
    const empresaId = user?.empresaId;
    const usuarioId = user?.id || user?._id || user?.sub;
    if (!empresaId || !Types.ObjectId.isValid(empresaId) || !usuarioId || !Types.ObjectId.isValid(usuarioId)) {
      throw new UnauthorizedException('Sessão inválida para registrar o resultado do contato.');
    }
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Notificação inválida.');
    const query = { _id: new Types.ObjectId(id), empresaId: new Types.ObjectId(empresaId) };
    const atual = await this.notificacaoModel.findOne(query).exec();
    if (!atual) throw new NotFoundException('Notificação não encontrada.');

    const observacao = dto.observacao.trim();
    if (atual.status === dto.status && atual.confirmacaoStatusTipo === 'manual' && atual.confirmacaoStatusObservacao === observacao) return atual;
    const transicoesPermitidas: Record<string, string[]> = {
      preparada: ['enviada', 'falha'],
      enviada: ['lida', 'falha'],
      falha: ['enviada'],
      lida: [],
    };
    if (!transicoesPermitidas[atual.status]?.includes(dto.status)) {
      throw new ConflictException('O resultado informado não combina com a etapa atual da mensagem. Atualize o histórico e tente novamente.');
    }

    const updated = await this.notificacaoModel.findOneAndUpdate(
      { ...query, status: atual.status },
      { $set: {
        status: dto.status,
        confirmacaoStatusTipo: 'manual',
        confirmacaoStatusEm: new Date(),
        confirmacaoStatusPor: new Types.ObjectId(usuarioId),
        confirmacaoStatusObservacao: observacao,
      } },
      { new: true },
    ).exec();
    if (!updated) throw new ConflictException('A mensagem foi atualizada em outra sessão. Recarregue o histórico antes de continuar.');

    await this.registrarAuditoriaNotificacao(updated, user, AUDITORIA_EVENTOS.COMUNICACAO_ATUALIZADA, {
      operacao: 'status_confirmado_manualmente',
      origemConfirmacao: 'manual',
      statusAnterior: atual.status,
      statusNovo: dto.status,
      observacao,
    });
    return updated;
  }

  async remove(id: string, empresaId?: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Notificação inválida.');
    const query: Record<string, unknown> = { _id: new Types.ObjectId(id), empresaId: this.getEmpresaObjectId(empresaId) };

    const removed = await this.notificacaoModel.findOneAndDelete(query).exec();
    if (!removed) {
      throw new NotFoundException('Notificacao nao encontrada.');
    }

    return removed;
  }

  private getEmpresaObjectId(empresaId?: string) {
    if (!empresaId || !Types.ObjectId.isValid(empresaId)) {
      throw new UnauthorizedException('Empresa do usuário não informada para consultar a comunicação.');
    }
    return new Types.ObjectId(empresaId);
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
