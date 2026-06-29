import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Garantia, GarantiaDocument } from './schemas/garantia.schema';
import { EnvioGarantia, EnvioGarantiaDocument } from './schemas/envio-garantia.schema';
import { RetornoGarantia, RetornoGarantiaDocument } from './schemas/retorno-garantia.schema';
import { CreditoFornecedor, CreditoFornecedorDocument } from './schemas/credito-fornecedor.schema';
import { CreateGarantiaDto } from './dto/create-garantia.dto';
import { UpdateGarantiaDto } from './dto/update-garantia.dto';
import { CreateEnvioGarantiaDto } from './dto/create-envio-garantia.dto';
import { UpdateEnvioGarantiaDto } from './dto/update-envio-garantia.dto';
import { CreateRetornoGarantiaDto } from './dto/create-retorno-garantia.dto';
import { UpdateRetornoGarantiaDto } from './dto/update-retorno-garantia.dto';
import { CreateCreditoFornecedorDto } from './dto/create-credito-fornecedor.dto';
import { UpdateCreditoFornecedorDto } from './dto/update-credito-fornecedor.dto';

@Injectable()
export class GarantiasService {
  constructor(
    @InjectModel(Garantia.name) private garantiaModel: Model<GarantiaDocument>,
    @InjectModel(EnvioGarantia.name) private envioGarantiaModel: Model<EnvioGarantiaDocument>,
    @InjectModel(RetornoGarantia.name) private retornoGarantiaModel: Model<RetornoGarantiaDocument>,
    @InjectModel(CreditoFornecedor.name) private creditoFornecedorModel: Model<CreditoFornecedorDocument>,
  ) {}

  // Garantia CRUD
  createGarantia(createGarantiaDto: CreateGarantiaDto) {
    const createdGarantia = new this.garantiaModel(createGarantiaDto);
    return createdGarantia.save();
  }

  findAllGarantias() {
    return this.garantiaModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('vendaId', 'numero total dataVenda status')
      .populate('ordemServicoId', 'statusOperacional prioridade dataEntrada')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  findOneGarantia(id: string) {
    return this.garantiaModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('vendaId', 'numero total dataVenda status')
      .populate('ordemServicoId', 'statusOperacional prioridade dataEntrada')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  updateGarantia(id: string, updateGarantiaDto: UpdateGarantiaDto) {
    return this.garantiaModel.findByIdAndUpdate(id, updateGarantiaDto, { new: true }).exec();
  }

  removeGarantia(id: string) {
    return this.garantiaModel.findByIdAndDelete(id).exec();
  }

  // EnvioGarantia CRUD
  createEnvioGarantia(createEnvioGarantiaDto: CreateEnvioGarantiaDto) {
    const createdEnvioGarantia = new this.envioGarantiaModel(createEnvioGarantiaDto);
    return createdEnvioGarantia.save();
  }

  findAllEnvioGarantias() {
    return this.envioGarantiaModel.find().exec();
  }

  findOneEnvioGarantia(id: string) {
    return this.envioGarantiaModel.findById(id).exec();
  }

  updateEnvioGarantia(id: string, updateEnvioGarantiaDto: UpdateEnvioGarantiaDto) {
    return this.envioGarantiaModel.findByIdAndUpdate(id, updateEnvioGarantiaDto, { new: true }).exec();
  }

  removeEnvioGarantia(id: string) {
    return this.envioGarantiaModel.findByIdAndDelete(id).exec();
  }

  // RetornoGarantia CRUD
  createRetornoGarantia(createRetornoGarantiaDto: CreateRetornoGarantiaDto) {
    const createdRetornoGarantia = new this.retornoGarantiaModel(createRetornoGarantiaDto);
    return createdRetornoGarantia.save();
  }

  findAllRetornoGarantias() {
    return this.retornoGarantiaModel.find().exec();
  }

  findOneRetornoGarantia(id: string) {
    return this.retornoGarantiaModel.findById(id).exec();
  }

  updateRetornoGarantia(id: string, updateRetornoGarantiaDto: UpdateRetornoGarantiaDto) {
    return this.retornoGarantiaModel.findByIdAndUpdate(id, updateRetornoGarantiaDto, { new: true }).exec();
  }

  removeRetornoGarantia(id: string) {
    return this.retornoGarantiaModel.findByIdAndDelete(id).exec();
  }

  // CreditoFornecedor CRUD
  createCreditoFornecedor(createCreditoFornecedorDto: CreateCreditoFornecedorDto) {
    const createdCreditoFornecedor = new this.creditoFornecedorModel(createCreditoFornecedorDto);
    return createdCreditoFornecedor.save();
  }

  findAllCreditoFornecedores() {
    return this.creditoFornecedorModel.find().exec();
  }

  findOneCreditoFornecedor(id: string) {
    return this.creditoFornecedorModel.findById(id).exec();
  }

  updateCreditoFornecedor(id: string, updateCreditoFornecedorDto: UpdateCreditoFornecedorDto) {
    return this.creditoFornecedorModel.findByIdAndUpdate(id, updateCreditoFornecedorDto, { new: true }).exec();
  }

  removeCreditoFornecedor(id: string) {
    return this.creditoFornecedorModel.findByIdAndDelete(id).exec();
  }
}
