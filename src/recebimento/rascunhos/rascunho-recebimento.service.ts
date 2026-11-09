import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RecebimentoEquipamento } from '../recebimento-equipamento/recebimento-equipamento.schema';
import { RascunhoRecebimento, RascunhoRecebimentoDocument } from './rascunho-recebimento.schema';
import { SalvarRascunhoRecebimentoDto } from './salvar-rascunho.dto';

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
};

function containsBinary(value: unknown): boolean {
  if (typeof value === 'string') return /(?:^|\s)(?:data:[^\s,]*,|blob:\S+)/i.test(value) || /[a-z\d+/]{256,}={0,2}/i.test(value);
  if (Array.isArray(value)) return value.some(containsBinary);
  return Boolean(value && typeof value === 'object' && Object.values(value).some(containsBinary));
}

@Injectable()
export class RascunhoRecebimentoService {
  constructor(@InjectModel(RascunhoRecebimento.name) private readonly rascunhos: Model<RascunhoRecebimentoDocument>) {}

  private scope(user?: CurrentUserPayload) {
    const empresaId = user?.empresaId, operadorId = user?.id || user?._id || user?.sub;
    if (!Types.ObjectId.isValid(String(empresaId)) || !Types.ObjectId.isValid(String(operadorId))) throw new UnauthorizedException('Sessao invalida para consultar o rascunho.');
    return { empresaId: new Types.ObjectId(empresaId), operadorId: new Types.ObjectId(operadorId) };
  }

  private assertOperacao(operacaoId: string) {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(operacaoId)) throw new BadRequestException('Operacao de rascunho invalida.');
  }

  private publicData(row: RascunhoRecebimentoDocument) {
    return {
      operacaoId: row.operacaoId, revisao: row.revisao, estado: row.estado,
      dados: row.estado === 'convertido' ? null : row.dados,
      ...(row.recebimentoId ? { recebimentoId: String(row.recebimentoId) } : {}), atualizadoEm: row.atualizadoEm,
    };
  }

  private convertido(recebimentoId: unknown, operacaoId: string, revisao = 0) {
    return { operacaoId, revisao, estado: 'convertido' as const, dados: null, recebimentoId: String(recebimentoId), atualizadoEm: undefined };
  }

  async carregar(operacaoId: string, user?: CurrentUserPayload) {
    this.assertOperacao(operacaoId);
    const scope = this.scope(user);
    const row = await this.rascunhos.findOne({ ...scope, operacaoId }).exec();
    if (row) return this.publicData(row);
    // A command saved before drafts were introduced is also a completed operation.
    const recebido = await this.rascunhos.db.model(RecebimentoEquipamento.name).findOne({ empresaId: scope.empresaId, recebidoPor: scope.operadorId, operacaoId }).select('_id').exec();
    if (recebido) return this.convertido(recebido._id, operacaoId);
    throw new NotFoundException('Rascunho nao encontrado.');
  }

  async listar(user?: CurrentUserPayload) {
    const scope = this.scope(user);
    const rows = await this.rascunhos.find({ ...scope, estado: 'rascunho' }).select('operacaoId revisao estado atualizadoEm dados.form.tipoEquipamento dados.form.marca dados.form.modelo dados.etapa').sort({ atualizadoEm: -1 }).limit(50).exec();
    return rows.map((row) => ({
      operacaoId: row.operacaoId, revisao: row.revisao, atualizadoEm: row.atualizadoEm,
      etapa: row.dados?.etapa ?? 0,
      equipamento: [row.dados?.form?.tipoEquipamento, row.dados?.form?.marca, row.dados?.form?.modelo].filter(Boolean).join(' ') || 'Entrada em preenchimento',
    }));
  }

  async salvar(operacaoId: string, input: SalvarRascunhoRecebimentoDto, user?: CurrentUserPayload) {
    this.assertOperacao(operacaoId);
    const scope = this.scope(user);
    const dto = plainToInstance(SalvarRascunhoRecebimentoDto, input);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    if (errors.length || Buffer.byteLength(JSON.stringify(dto)) > 64 * 1024 || containsBinary(dto.dados)) throw new BadRequestException('Dados de rascunho invalidos. Envie somente campos do formulario e metadados de arquivos.');
    const hashConteudo = createHash('sha256').update(canonical(dto.dados)).digest('hex');
    let saved: RascunhoRecebimentoDocument | null = null;
    try {
      await this.rascunhos.db.transaction(async (session) => {
        if (dto.dados.form?.clienteId) {
          const cliente = await this.rascunhos.db.model('Cliente').exists({ _id: dto.dados.form.clienteId, empresaId: scope.empresaId }).session(session);
          if (!cliente) throw new NotFoundException('Cliente nao encontrado nesta empresa.');
        }
        let current = await this.rascunhos.findOne({ ...scope, operacaoId }).select('+hashConteudo').session(session).exec();
        if (!current) {
          if (dto.revisaoEsperada !== 0) throw new ConflictException('O rascunho mudou. Recarregue antes de salvar.');
          [current] = await this.rascunhos.create([{ ...scope, operacaoId, revisao: 0, dados: {}, hashConteudo: '', estado: 'rascunho' }], { session });
        }
        if (current.estado === 'convertido') { saved = current; return; }
        const sameContent = current.hashConteudo === hashConteudo;
        if ((current.revisao === dto.revisaoEsperada || current.revisao === dto.revisaoEsperada + 1) && sameContent) { saved = current; return; }
        if (current.revisao !== dto.revisaoEsperada) throw new ConflictException('O rascunho foi alterado em outra aba. Recarregue antes de continuar.');
        saved = await this.rascunhos.findOneAndUpdate({ ...scope, operacaoId, revisao: dto.revisaoEsperada, estado: 'rascunho' }, {
          $set: { dados: dto.dados, hashConteudo }, $inc: { revisao: 1 },
        }, { returnDocument: 'after', runValidators: true, session }).exec();
        if (!saved) throw new ConflictException('O rascunho mudou. Recarregue antes de salvar.');
        const recebido = await this.rascunhos.db.model(RecebimentoEquipamento.name).findOne({ empresaId: scope.empresaId, recebidoPor: scope.operadorId, operacaoId }).select('_id').session(session).exec();
        if (recebido) {
          saved = await this.rascunhos.findOneAndUpdate({ ...scope, operacaoId }, { $set: { estado: 'convertido', recebimentoId: recebido._id, dados: {} }, $inc: { revisao: 1 } }, { returnDocument: 'after', session }).exec();
        }
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const current = await this.rascunhos.findOne({ ...scope, operacaoId }).select('+hashConteudo').exec();
      if (!current || current.estado !== 'convertido' && (current.hashConteudo !== hashConteudo || current.revisao !== dto.revisaoEsperada + 1)) throw new ConflictException('O rascunho foi alterado em outra aba. Recarregue antes de continuar.');
      saved = current;
    }
    if (!saved) throw new ConflictException('Nao foi possivel confirmar o rascunho. Recarregue antes de continuar.');
    const result = this.publicData(saved);
    if (result.estado === 'convertido') throw new ConflictException({ message: 'Esta entrada ja foi cadastrada. Abra o recebimento salvo.', estado: result.estado, recebimentoId: result.recebimentoId });
    return result;
  }
}
