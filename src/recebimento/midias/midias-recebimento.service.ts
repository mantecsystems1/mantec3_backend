import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MidiasRecebimento, MidiasRecebimentoDocument } from './midias-recebimento.schema';
import { CreateMidiasRecebimentoDto } from './dto/create-midias-recebimento.dto';
import { UpdateMidiasRecebimentoDto } from './dto/update-midias-recebimento.dto';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from '../recebimento-equipamento/recebimento-equipamento.schema';

@Injectable()
export class MidiasRecebimentoService {
  constructor(
    @InjectModel(MidiasRecebimento.name) private midiasRecebimentoModel: Model<MidiasRecebimentoDocument>,
    @InjectModel(RecebimentoEquipamento.name) private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
  ) {}

  async validarUpload(dto: CreateMidiasRecebimentoDto, empresaId?: string) {
    await this.assertRecebimentoDaEmpresa(dto.recebimentoEquipamentoId, empresaId);
    if (!dto.chaveCliente) return null;
    const recebimento = await this.recebimentoEquipamentoModel.findOne({ _id: dto.recebimentoEquipamentoId, empresaId }).exec();
    const expected = recebimento?.midiasEsperadas?.find((item) => item.chaveCliente === dto.chaveCliente);
    if (!expected || expected.hashSha256 !== dto.hashSha256 || expected.tipo !== dto.tipo) throw new ConflictException('O arquivo nao corresponde ao anexo esperado nesta entrada.');
    return this.midiasRecebimentoModel.findOne({ recebimentoEquipamentoId: dto.recebimentoEquipamentoId, chaveCliente: dto.chaveCliente }).exec();
  }

  async create(createMidiasRecebimentoDto: CreateMidiasRecebimentoDto, empresaId?: string, arquivoVerificado = false) {
    await this.assertRecebimentoDaEmpresa(createMidiasRecebimentoDto.recebimentoEquipamentoId, empresaId);
    if (createMidiasRecebimentoDto.chaveCliente) {
      if (!arquivoVerificado) throw new ConflictException('Envie o arquivo para vincular uma midia pendente.');
      const existing = await this.validarUpload(createMidiasRecebimentoDto, empresaId);
      if (existing) return existing;
    }
    const createdMidiasRecebimento = new this.midiasRecebimentoModel({
      ...createMidiasRecebimentoDto,
      urlArquivo: this.normalizarUrlArquivo(createMidiasRecebimentoDto.urlArquivo),
      capturadoEm: this.toOptionalDate(createMidiasRecebimentoDto.capturadoEm),
    });
    try { return await createdMidiasRecebimento.save(); }
    catch (error) {
      if ((error as { code?: number }).code === 11000 && createMidiasRecebimentoDto.chaveCliente) {
        const existing = await this.midiasRecebimentoModel.findOne({ recebimentoEquipamentoId: createMidiasRecebimentoDto.recebimentoEquipamentoId, chaveCliente: createMidiasRecebimentoDto.chaveCliente }).exec();
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findAll(empresaId?: string) {
    const recebimentoIds = await this.getRecebimentoIdsDaEmpresa(empresaId);
    return this.midiasRecebimentoModel.find({ recebimentoEquipamentoId: { $in: recebimentoIds } }).exec();
  }

  async findOne(id: string, empresaId?: string) {
    const midia = await this.midiasRecebimentoModel.findById(id).exec();
    if (!midia) {
      return null;
    }

    await this.assertRecebimentoDaEmpresa(midia.recebimentoEquipamentoId, empresaId);
    return midia;
  }

  async update(id: string, updateMidiasRecebimentoDto: UpdateMidiasRecebimentoDto, empresaId?: string) {
    const current = await this.findOne(id, empresaId);
    if (!current) {
      throw new NotFoundException('Midia do recebimento nao encontrada.');
    }
    if (current.chaveCliente) throw new ConflictException('Anexo da entrada composta deve preservar a evidencia original.');
    if (updateMidiasRecebimentoDto.recebimentoEquipamentoId) {
      await this.assertRecebimentoDaEmpresa(updateMidiasRecebimentoDto.recebimentoEquipamentoId, empresaId);
    }

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

  async remove(id: string, empresaId?: string) {
    const current = await this.findOne(id, empresaId);
    if (!current) {
      throw new NotFoundException('Midia do recebimento nao encontrada.');
    }
    if (current.chaveCliente) throw new ConflictException('Anexo da entrada composta deve preservar a evidencia original.');

    return this.midiasRecebimentoModel.findByIdAndDelete(id).exec();
  }

  private async getRecebimentoIdsDaEmpresa(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const recebimentos = await this.recebimentoEquipamentoModel.find({ empresaId }).select('_id').lean().exec();
    return recebimentos.map((recebimento) => recebimento._id);
  }

  private async assertRecebimentoDaEmpresa(recebimentoEquipamentoId: unknown, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const recebimento = await this.recebimentoEquipamentoModel
      .findOne({ _id: String(recebimentoEquipamentoId), empresaId })
      .select('_id')
      .lean()
      .exec();
    if (!recebimento) {
      throw new NotFoundException('Recebimento nao encontrado.');
    }
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
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
