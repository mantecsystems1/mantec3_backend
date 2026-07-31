import { Injectable } from '@nestjs/common';
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

  async create(createLogEventoDto: CreateLogEventoDto): Promise<LogEvento> {
    const createdLogEvento = new this.logEventoModel(createLogEventoDto);
    return createdLogEvento.save();
  }

  async registrarEventoNegocio(evento: EventoNegocioAuditavel): Promise<LogEvento> {
    return this.create(montarLogEventoNegocio(evento));
  }

  async findAll(): Promise<LogEvento[]> {
    return this.logEventoModel.find().exec();
  }

  async findOne(id: string) {
    return this.logEventoModel.findById(id).exec();
  }

  async findByEntidade(entidade: string, entidadeId: string): Promise<LogEvento[]> {
    return this.logEventoModel
      .find({
        entidade,
        entidadeId: new Types.ObjectId(entidadeId),
      })
      .populate('usuarioId', 'nome email perfil')
      .sort({ data: -1 })
      .exec();
  }

  async update(id: string, updateLogEventoDto: UpdateLogEventoDto) {
    return this.logEventoModel.findByIdAndUpdate(id, updateLogEventoDto, { new: true }).exec();
  }

  async remove(id: string) {
    return this.logEventoModel.findByIdAndDelete(id).exec();
  }
}
