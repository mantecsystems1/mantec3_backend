import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from './recebimento-equipamento.schema';
import { CreateRecebimentoCompletoDto } from './dto/create-recebimento-completo.dto';
import { CondicoesEquipamento } from '../condicoes/condicoes-equipamento.schema';
import { ComponentesAusentes } from '../componentes-ausentes/componentes-ausentes.schema';
import { MidiasRecebimento } from '../midias/midias-recebimento.schema';
import { TermosRecebimento } from '../termos/termos-recebimento.schema';
import { LogEvento } from '../../auditoria/schemas/log-evento.schema';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS, montarLogEventoNegocio } from '../../auditoria/auditoria-eventos';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RascunhoRecebimento } from '../rascunhos/rascunho-recebimento.schema';
import { gerarProtocoloOperacional } from '../../common/protocolo-operacional';

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

@Injectable()
export class RecebimentoCompletoService {
  constructor(@InjectModel(RecebimentoEquipamento.name) private readonly recebimentos: Model<RecebimentoEquipamentoDocument>) {}

  private actor(user?: CurrentUserPayload) {
    const empresaId = user?.empresaId;
    const usuarioId = user?.id || user?._id || user?.sub;
    if (!Types.ObjectId.isValid(String(empresaId)) || !Types.ObjectId.isValid(String(usuarioId))) throw new UnauthorizedException('Sessao invalida para salvar a entrada.');
    return { empresaId: String(empresaId), usuarioId: String(usuarioId) };
  }

  async create(dto: CreateRecebimentoCompletoDto, user?: CurrentUserPayload) {
    const actor = this.actor(user);
    if (!dto.recebimento || dto.recebimento.empresaId !== actor.empresaId) throw new BadRequestException('Empresa da entrada invalida.');
    const esperadas = dto.midiasEsperadas ?? [];
    if (esperadas.length + (dto.midiasLinks?.length ?? 0) > 5 || new Set(esperadas.map((item) => item.chaveCliente)).size !== esperadas.length) throw new BadRequestException('Midias duplicadas ou acima do limite de cinco.');
    if (dto.termo?.assinado && (!dto.termo.signatarioNome?.trim() || !dto.termo.signatarioDocumento?.trim() || (dto.termo.metodoAssinatura === 'assinatura_tela' && !dto.termo.assinaturaImagemBase64))) throw new BadRequestException('Complete os dados e a assinatura do termo.');
    const entrada = { ...dto.recebimento } as Partial<CreateRecebimentoCompletoDto['recebimento']>;
    delete entrada.recebidoPor;
    delete entrada.empresaId;
    const operacaoHash = hash(canonical({ ...dto, rascunhoRevisao: undefined, recebimento: entrada, termo: dto.termo ? {
      ...dto.termo, dataAssinatura: undefined, ipAssinatura: undefined, userAgentAssinatura: undefined,
      termoHashSha256: undefined, assinaturaHashSha256: undefined,
    } : undefined }));
    const scope = { empresaId: actor.empresaId, recebidoPor: actor.usuarioId, operacaoId: dto.operacaoId };
    const existing = await this.recebimentos.findOne(scope).select('+operacaoHash').exec();
    if (existing) return this.replay(existing, operacaoHash, actor.empresaId);

    let id = '';
    try {
      await this.recebimentos.db.transaction(async (session) => {
        const rascunhos = this.recebimentos.db.models[RascunhoRecebimento.name];
        const rascunhoScope = { empresaId: actor.empresaId, operadorId: actor.usuarioId, operacaoId: dto.operacaoId };
        if (rascunhos) {
          const draft = await rascunhos.findOneAndUpdate(rascunhoScope, {
            $setOnInsert: { ...rascunhoScope, revisao: 0, estado: 'rascunho', dados: {}, hashConteudo: '' }, $inc: { __v: 1 },
          }, { upsert: true, returnDocument: 'after', session }).exec();
          if (!draft || draft.estado === 'convertido') throw new ConflictException('Esta entrada ja foi cadastrada. Abra o recebimento salvo.');
          if ((draft.revisao > 0 && dto.rascunhoRevisao === undefined) || (dto.rascunhoRevisao !== undefined && dto.rascunhoRevisao !== draft.revisao)) {
            throw new ConflictException('O rascunho foi alterado em outra aba. Recarregue antes de cadastrar.');
          }
        } else if (dto.rascunhoRevisao !== undefined) {
          throw new ConflictException('O armazenamento de rascunhos nao esta disponivel. Tente novamente.');
        }
        const cliente = await this.recebimentos.db.model('Cliente').exists({ _id: entrada.clienteId, empresaId: actor.empresaId }).session(session);
        if (!cliente) throw new NotFoundException('Cliente nao encontrado nesta empresa.');
        const numero = await gerarProtocoloOperacional(this.recebimentos.db, actor.empresaId, 'REC', new Date(), session);
        const [saved] = await this.recebimentos.create([{
          ...entrada, ...scope, numero, operacaoHash, midiasEsperadas: esperadas,
          estadoSalvamento: esperadas.length ? 'pendente_midias' : 'confirmado',
        }], { session });
        id = String(saved._id);
        for (const [name, data] of [
          [CondicoesEquipamento.name, dto.condicoes ?? []],
          [ComponentesAusentes.name, dto.componentesAusentes ?? []],
          [MidiasRecebimento.name, dto.midiasLinks ?? []],
        ] as const) {
          if (data.length) await this.recebimentos.db.model(name).insertMany(data.map((item) => ({ ...item, recebimentoEquipamentoId: saved._id })), { session });
        }
        if (dto.termo) {
          const termo = { ...dto.termo, termoHashSha256: hash(dto.termo.texto), assinaturaHashSha256: dto.termo.assinaturaImagemBase64 ? hash(dto.termo.assinaturaImagemBase64) : undefined };
          const [termoSaved] = await this.recebimentos.db.model(TermosRecebimento.name).create([{ ...termo, recebimentoEquipamentoId: saved._id, dataAssinatura: termo.assinado ? new Date() : undefined }], { session });
          await this.recebimentos.db.model(LogEvento.name).create([montarLogEventoNegocio({
            empresaId: actor.empresaId, usuarioId: actor.usuarioId, entidade: AUDITORIA_ENTIDADES.RECEBIMENTO, entidadeId: id,
            tipoEvento: AUDITORIA_EVENTOS.TERMO_GERADO, dados: { termoId: String(termoSaved._id), assinado: termo.assinado ?? false, operacao: 'entrada_composta' },
          })], { session });
        }
        await this.recebimentos.db.model(LogEvento.name).create([montarLogEventoNegocio({
          empresaId: actor.empresaId, usuarioId: actor.usuarioId, entidade: AUDITORIA_ENTIDADES.RECEBIMENTO, entidadeId: id,
          tipoEvento: AUDITORIA_EVENTOS.RECEBIMENTO_CRIADO,
          dados: { operacao: 'entrada_composta', estadoSalvamento: saved.estadoSalvamento, midiasEsperadas: esperadas.length },
        })], { session });
        if (rascunhos) await rascunhos.updateOne(rascunhoScope, {
          $set: { estado: 'convertido', recebimentoId: saved._id, dados: {} }, $inc: { revisao: 1 },
        }, { session }).exec();
      });
    } catch (error) {
      // A competing request can win the unique operation key after our initial read.
      const winner = await this.recebimentos.findOne(scope).select('+operacaoHash').exec();
      if (winner) return this.replay(winner, operacaoHash, actor.empresaId);
      throw error;
    }
    return this.get(id, actor.empresaId);
  }

  private replay(existing: RecebimentoEquipamentoDocument, operacaoHash: string, empresaId: string) {
    if (existing.operacaoHash !== operacaoHash) throw new ConflictException('Esta operacao ja foi salva com outros dados. Retome a entrada existente.');
    return this.get(String(existing._id), empresaId);
  }

  async get(id: string, empresaId?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    const recebimento = await this.recebimentos.findOne({ _id: id, empresaId, estadoSalvamento: { $exists: true } }).lean().exec();
    if (!recebimento) throw new NotFoundException('Entrada composta nao encontrada.');
    const filter = { recebimentoEquipamentoId: recebimento._id };
    const condicoes = await this.recebimentos.db.model<CondicoesEquipamento>(CondicoesEquipamento.name).find(filter).lean().exec();
    const componentesAusentes = await this.recebimentos.db.model<ComponentesAusentes>(ComponentesAusentes.name).find(filter).lean().exec();
    const midias = await this.recebimentos.db.model<MidiasRecebimento>(MidiasRecebimento.name).find(filter).lean().exec();
    const termo = await this.recebimentos.db.model<TermosRecebimento>(TermosRecebimento.name).findOne(filter).lean().exec();
    const pendenciasMidias = (recebimento.midiasEsperadas ?? []).filter((expected) => !midias.some((item) => item.chaveCliente === expected.chaveCliente && item.hashSha256 === expected.hashSha256));
    return { recebimento, condicoes, componentesAusentes, midias, termo: termo ?? undefined, pendenciasMidias };
  }

  async pendentes(user?: CurrentUserPayload) {
    const { empresaId, usuarioId } = this.actor(user);
    return this.recebimentos.find({ empresaId, recebidoPor: usuarioId, estadoSalvamento: 'pendente_midias' })
      .select('_id marca modelo dataRecebimento').sort({ criadoEm: -1 }).limit(50).lean().exec();
  }

  async porOperacao(operacaoId: string, user?: CurrentUserPayload) {
    const { empresaId, usuarioId } = this.actor(user);
    const recebimento = await this.recebimentos.findOne({ empresaId, recebidoPor: usuarioId, operacaoId }).select('_id').exec();
    if (!recebimento) throw new NotFoundException('Operacao ainda nao salva.');
    return this.get(String(recebimento._id), empresaId);
  }

  async confirmar(id: string, user?: CurrentUserPayload) {
    const { empresaId, usuarioId } = this.actor(user);
    await this.recebimentos.db.transaction(async (session) => {
      const recebimento = await this.recebimentos.findOne({ _id: id, empresaId, estadoSalvamento: { $exists: true } }).session(session).exec();
      if (!recebimento) throw new NotFoundException('Entrada nao encontrada.');
      if (recebimento.estadoSalvamento === 'confirmado') return;
      const midias = await this.recebimentos.db.model<MidiasRecebimento>(MidiasRecebimento.name).find({ recebimentoEquipamentoId: id }).session(session).lean().exec();
      if ((recebimento.midiasEsperadas ?? []).some((expected) => !midias.some((item) => item.chaveCliente === expected.chaveCliente && item.hashSha256 === expected.hashSha256))) throw new ConflictException('Existem anexos pendentes. Reenvie os arquivos indicados antes de concluir.');
      recebimento.estadoSalvamento = 'confirmado';
      await recebimento.save({ session });
      await this.recebimentos.db.model(LogEvento.name).create([montarLogEventoNegocio({ empresaId, usuarioId, entidade: AUDITORIA_ENTIDADES.RECEBIMENTO, entidadeId: id, tipoEvento: AUDITORIA_EVENTOS.RECEBIMENTO_ATUALIZADO, dados: { operacao: 'entrada_confirmada' } })], { session });
    });
    return this.get(id, empresaId);
  }
}
