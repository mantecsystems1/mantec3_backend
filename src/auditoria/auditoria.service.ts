import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LogEvento, LogEventoDocument } from './schemas/log-evento.schema';
import { CreateLogEventoDto } from './dto/create-log-evento.dto';
import { UpdateLogEventoDto } from './dto/update-log-evento.dto';
import { EventoNegocioAuditavel, montarLogEventoNegocio } from './auditoria-eventos';

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectModel(LogEvento.name) private logEventoModel: Model<LogEventoDocument>,
  ) {}

  async create(createLogEventoDto: CreateLogEventoDto, actorEmpresaId?: string): Promise<LogEvento> {
    this.assertEmpresaPermitida(createLogEventoDto.empresaId, actorEmpresaId);

    const createdLogEvento = new this.logEventoModel(createLogEventoDto);
    return createdLogEvento.save();
  }

  async registrarEventoNegocio(evento: EventoNegocioAuditavel): Promise<LogEvento> {
    return this.create(montarLogEventoNegocio(evento));
  }

  async findAll(empresaId?: string): Promise<LogEvento[]> {
    return this.logEventoModel.find(this.getEmpresaQuery(empresaId)).exec();
  }

  async findOne(id: string, empresaId?: string) {
    return this.logEventoModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
  }

  async findByEntidade(entidade: string, entidadeId: string, empresaId?: string): Promise<LogEvento[]> {
    return this.logEventoModel
      .find(this.getEmpresaQuery(empresaId, {
        entidade,
        entidadeId: new Types.ObjectId(entidadeId),
      }))
      .populate('usuarioId', 'nome email perfil')
      .sort({ data: -1 })
      .exec();
  }

  async update(id: string, updateLogEventoDto: UpdateLogEventoDto, actorEmpresaId?: string) {
    this.assertEmpresaPermitida(updateLogEventoDto.empresaId, actorEmpresaId);

    return this.logEventoModel
      .findOneAndUpdate(this.getEmpresaQuery(actorEmpresaId, { _id: id }), updateLogEventoDto, { new: true })
      .exec();
  }

  async remove(id: string, empresaId?: string) {
    return this.logEventoModel.findOneAndDelete(this.getEmpresaQuery(empresaId, { _id: id })).exec();
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private assertEmpresaPermitida(empresaId?: string | Types.ObjectId, actorEmpresaId?: string) {
    if (actorEmpresaId && empresaId && String(empresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Empresa do registro nao corresponde a empresa do usuario autenticado.');
    }
  }
}
