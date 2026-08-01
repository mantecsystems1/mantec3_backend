import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Garantia, GarantiaDocument } from './schemas/garantia.schema';
import { EnvioGarantia, EnvioGarantiaDocument } from './schemas/envio-garantia.schema';
import { RetornoGarantia, RetornoGarantiaDocument } from './schemas/retorno-garantia.schema';
import { CreditoFornecedor, CreditoFornecedorDocument } from './schemas/credito-fornecedor.schema';
import { PedidosCompra, PedidosCompraDocument } from '../compras/schemas/pedido-compra.schema';
import { ItensPedidoCompra, ItensPedidoCompraDocument } from '../compras/schemas/itens-pedido-compra.schema';
import { CreateGarantiaDto } from './dto/create-garantia.dto';
import { UpdateGarantiaDto } from './dto/update-garantia.dto';
import { CreateEnvioGarantiaDto } from './dto/create-envio-garantia.dto';
import { UpdateEnvioGarantiaDto } from './dto/update-envio-garantia.dto';
import { CreateRetornoGarantiaDto } from './dto/create-retorno-garantia.dto';
import { UpdateRetornoGarantiaDto } from './dto/update-retorno-garantia.dto';
import { CreateCreditoFornecedorDto } from './dto/create-credito-fornecedor.dto';
import { UpdateCreditoFornecedorDto } from './dto/update-credito-fornecedor.dto';
import { assertCanEditGarantia, assertCanTransitionGarantia } from './state/garantia.transitions';
import { GARANTIA_STATUS, isGarantiaStatus } from './state/garantia.states';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';

@Injectable()
export class GarantiasService {
  constructor(
    @InjectModel(Garantia.name) private garantiaModel: Model<GarantiaDocument>,
    @InjectModel(EnvioGarantia.name) private envioGarantiaModel: Model<EnvioGarantiaDocument>,
    @InjectModel(RetornoGarantia.name) private retornoGarantiaModel: Model<RetornoGarantiaDocument>,
    @InjectModel(CreditoFornecedor.name) private creditoFornecedorModel: Model<CreditoFornecedorDocument>,
    @InjectModel(PedidosCompra.name) private pedidosCompraModel: Model<PedidosCompraDocument>,
    @InjectModel(ItensPedidoCompra.name) private itensPedidoCompraModel: Model<ItensPedidoCompraDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async createGarantia(createGarantiaDto: CreateGarantiaDto, actorId?: string) {
    if (!isGarantiaStatus(createGarantiaDto.status)) {
      throw new BadRequestException(`Status de garantia invalido: ${createGarantiaDto.status}`);
    }

    const fornecedorId = createGarantiaDto.fornecedorId || await this.inferFornecedorPorProduto(
      createGarantiaDto.produtoId,
      createGarantiaDto.empresaId,
    );

    if (!fornecedorId) {
      throw new BadRequestException('Fornecedor nao informado e nao foi possivel inferir pelo historico de compras do produto.');
    }

    const garantiaData = { ...createGarantiaDto, fornecedorId };
    const createdGarantia = new this.garantiaModel(garantiaData);
    const saved = await createdGarantia.save();

    if (actorId) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: garantiaData.empresaId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.GARANTIA_ABERTA,
        entidade: AUDITORIA_ENTIDADES.GARANTIA,
        entidadeId: saved._id as Types.ObjectId,
        dados: {
          status: garantiaData.status,
          clienteId: garantiaData.clienteId,
          vendaId: garantiaData.vendaId,
          produtoId: garantiaData.produtoId,
          fornecedorId: garantiaData.fornecedorId,
          quantidade: garantiaData.quantidade,
        },
      });
    }

    return saved;
  }

  private async inferFornecedorPorProduto(produtoId: string, empresaId: string) {
    if (!Types.ObjectId.isValid(produtoId) || !Types.ObjectId.isValid(empresaId)) {
      return '';
    }

    const itens = await this.itensPedidoCompraModel
      .find({ produtoId: new Types.ObjectId(produtoId) })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    for (const item of itens) {
      const pedido = await this.pedidosCompraModel
        .findOne({
          _id: item.pedidoCompraId,
          empresaId: new Types.ObjectId(empresaId),
        })
        .lean()
        .exec();

      if (pedido?.fornecedorId) {
        return String(pedido.fornecedorId);
      }
    }

    return '';
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

  async updateGarantia(id: string, updateGarantiaDto: UpdateGarantiaDto, actorId?: string) {
    const garantia = await this.garantiaModel.findById(id).exec();
    if (!garantia) {
      throw new NotFoundException('Garantia nao encontrada.');
    }

    const nextStatus = updateGarantiaDto.status;
    const hasNonStatusChanges = Object.keys(updateGarantiaDto).some((key) => key !== 'status');

    if (nextStatus) {
      assertCanTransitionGarantia(garantia.status, nextStatus);
    }

    if (hasNonStatusChanges) {
      assertCanEditGarantia(garantia.status);
    }

    const updated = await this.garantiaModel.findByIdAndUpdate(id, updateGarantiaDto, { new: true }).exec();

    if (actorId && nextStatus && nextStatus !== garantia.status) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: garantia.empresaId,
        usuarioId: actorId,
        tipoEvento: nextStatus === GARANTIA_STATUS.CONCLUIDA
          ? AUDITORIA_EVENTOS.GARANTIA_FINALIZADA
          : AUDITORIA_EVENTOS.GARANTIA_STATUS_ALTERADO,
        entidade: AUDITORIA_ENTIDADES.GARANTIA,
        entidadeId: garantia._id as Types.ObjectId,
        dados: {
          statusAnterior: garantia.status,
          statusAtual: nextStatus,
        },
      });
    }

    return updated;
  }

  async removeGarantia(id: string) {
    const garantia = await this.garantiaModel.findById(id).exec();
    if (!garantia) {
      throw new NotFoundException('Garantia nao encontrada.');
    }

    assertCanEditGarantia(garantia.status);
    return this.garantiaModel.findByIdAndDelete(id).exec();
  }

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

  updateRetornoGarantia(id: string, updateRetornoGarantDto: UpdateRetornoGarantiaDto) {
    return this.retornoGarantiaModel.findByIdAndUpdate(id, updateRetornoGarantDto, { new: true }).exec();
  }

  removeRetornoGarantia(id: string) {
    return this.retornoGarantiaModel.findByIdAndDelete(id).exec();
  }

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
