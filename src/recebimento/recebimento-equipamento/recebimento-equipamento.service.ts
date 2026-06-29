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

@Injectable()
export class RecebimentoEquipamentoService {
  constructor(
    @InjectModel(RecebimentoEquipamento.name) private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(CondicoesEquipamento.name) private condicoesEquipamentoModel: Model<CondicoesEquipamentoDocument>,
    @InjectModel(ComponentesAusentes.name) private componentesAusentesModel: Model<ComponentesAusentesDocument>,
    @InjectModel(MidiasRecebimento.name) private midiasRecebimentoModel: Model<MidiasRecebimentoDocument>,
    @InjectModel(TermosRecebimento.name) private termosRecebimentoModel: Model<TermosRecebimentoDocument>,
  ) {}

  create(createRecebimentoEquipamentoDto: CreateRecebimentoEquipamentoDto) {
    const createdRecebimentoEquipamento = new this.recebimentoEquipamentoModel(createRecebimentoEquipamentoDto);
    return createdRecebimentoEquipamento.save();
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

  update(id: string, updateRecebimentoEquipamentoDto: UpdateRecebimentoEquipamentoDto) {
    return this.recebimentoEquipamentoModel.findByIdAndUpdate(id, updateRecebimentoEquipamentoDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.recebimentoEquipamentoModel.findByIdAndDelete(id).exec();
  }
}
