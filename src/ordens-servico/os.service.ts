import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrdemServico, OrdemServicoDocument } from './schemas/ordem-servico.schema';
import { ItensUtilizadosOS, ItensUtilizadosOSDocument } from './schemas/itens-utilizados-os.schema';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { CreateItensUtilizadosOSDto } from './dto/create-itens-utilizados-os.dto';
import { UpdateItensUtilizadosOSDto } from './dto/update-itens-utilizados-os.dto';

@Injectable()
export class OsService {
  constructor(
    @InjectModel(OrdemServico.name) private ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(ItensUtilizadosOS.name) private itensUtilizadosOSModel: Model<ItensUtilizadosOSDocument>,
  ) {}

  // OrdemServico CRUD
  create(createOrdemServicoDto: CreateOrdemServicoDto) {
    const createdOrdemServico = new this.ordemServicoModel(createOrdemServicoDto);
    return createdOrdemServico.save();
  }

  findAll() {
    return this.ordemServicoModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  findOne(id: string) {
    return this.ordemServicoModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('tecnicoId', 'nome email perfil')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('orcamentoId', 'total status validade')
      .exec();
  }

  update(id: string, updateOrdemServicoDto: UpdateOrdemServicoDto) {
    return this.ordemServicoModel.findByIdAndUpdate(id, updateOrdemServicoDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.ordemServicoModel.findByIdAndDelete(id).exec();
  }

  // ItensUtilizadosOS CRUD
  createItem(createItensUtilizadosOSDto: CreateItensUtilizadosOSDto) {
    const createdItem = new this.itensUtilizadosOSModel(createItensUtilizadosOSDto);
    return createdItem.save();
  }

  findAllItems() {
    return this.itensUtilizadosOSModel.find().exec();
  }

  findOneItem(id: string) {
    return this.itensUtilizadosOSModel.findById(id).exec();
  }

  updateItem(id: string, updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto) {
    return this.itensUtilizadosOSModel.findByIdAndUpdate(id, updateItensUtilizadosOSDto, { new: true }).exec();
  }

  removeItem(id: string) {
    return this.itensUtilizadosOSModel.findByIdAndDelete(id).exec();
  }
}
