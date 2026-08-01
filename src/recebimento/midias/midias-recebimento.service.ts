import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MidiasRecebimento, MidiasRecebimentoDocument } from './midias-recebimento.schema';
import { CreateMidiasRecebimentoDto } from './dto/create-midias-recebimento.dto';
import { UpdateMidiasRecebimentoDto } from './dto/update-midias-recebimento.dto';

@Injectable()
export class MidiasRecebimentoService {
  constructor(
    @InjectModel(MidiasRecebimento.name) private midiasRecebimentoModel: Model<MidiasRecebimentoDocument>,
  ) {}

  create(createMidiasRecebimentoDto: CreateMidiasRecebimentoDto) {
    const createdMidiasRecebimento = new this.midiasRecebimentoModel({
      ...createMidiasRecebimentoDto,
      urlArquivo: this.normalizarUrlArquivo(createMidiasRecebimentoDto.urlArquivo),
      capturadoEm: this.toOptionalDate(createMidiasRecebimentoDto.capturadoEm),
    });
    return createdMidiasRecebimento.save();
  }

  findAll() {
    return this.midiasRecebimentoModel.find().exec();
  }

  findOne(id: string) {
    return this.midiasRecebimentoModel.findById(id).exec();
  }

  update(id: string, updateMidiasRecebimentoDto: UpdateMidiasRecebimentoDto) {
    const updateData = {
      ...updateMidiasRecebimentoDto,
      ...(updateMidiasRecebimentoDto.urlArquivo
        ? { urlArquivo: this.normalizarUrlArquivo(updateMidiasRecebimentoDto.urlArquivo) }
        : {}),
      ...(updateMidiasRecebimentoDto.capturadoEm
        ? { capturadoEm: this.toOptionalDate(updateMidiasRecebimentoDto.capturadoEm) }
        : {}),
    };

    return this.midiasRecebimentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  remove(id: string) {
    return this.midiasRecebimentoModel.findByIdAndDelete(id).exec();
  }

  private normalizarUrlArquivo(urlArquivo: string) {
    const value = String(urlArquivo ?? '').trim().replace(/\\/g, '/');
    if (!value || /^https?:\/\//i.test(value)) {
      return value;
    }

    const clean = value
      .replace(/^\/+/, '')
      .replace(/^(uploads\/)+/i, 'uploads/');

    return clean.startsWith('uploads/') ? `/${clean}` : `/uploads/${clean}`;
  }

  private toOptionalDate(value?: string) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
