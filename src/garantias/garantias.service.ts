import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

  async createGarantia(createGarantiaDto: CreateGarantiaDto, actorId?: string, actorEmpresaId?: string) {
    const empresaId = this.getEmpresaIdPermitida(createGarantiaDto.empresaId, actorEmpresaId);
    const status = createGarantiaDto.status || GARANTIA_STATUS.ABERTA;

    if (!isGarantiaStatus(status)) {
      throw new BadRequestException(`Status de garantia invalido: ${status}`);
    }

    const fornecedorIdInformado = createGarantiaDto.fornecedorId?.trim();
    const fornecedorIdInferido = fornecedorIdInformado
      ? ''
      : await this.inferFornecedorPorProduto(createGarantiaDto.produtoId, empresaId);
    const fornecedorId = fornecedorIdInformado || fornecedorIdInferido;

    if (!fornecedorId) {
      throw new BadRequestException({
        field: 'fornecedorId',
        message: 'Selecione o fornecedor da garantia. Nao foi possivel inferir pelo historico de compras do produto.',
      });
    }

    const garantiaData = { ...createGarantiaDto, empresaId, fornecedorId, status };
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

  findAllGarantias(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.garantiaModel
      .find({ empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('vendaId', 'numero total dataVenda status')
      .populate('ordemServicoId', 'numero statusOperacional prioridade dataEntrada')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  findOneGarantia(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.garantiaModel
      .findOne({ _id: id, empresaId })
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('vendaId', 'numero total dataVenda status')
      .populate('ordemServicoId', 'numero statusOperacional prioridade dataEntrada')
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .populate('fornecedorId', 'nome cnpj')
      .exec();
  }

  async updateGarantia(id: string, updateGarantiaDto: UpdateGarantiaDto, actorId?: string, actorEmpresaId?: string) {
    this.assertEmpresaInformada(actorEmpresaId);
    const garantia = await this.garantiaModel.findOne({ _id: id, empresaId: actorEmpresaId }).exec();
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

    const updated = await this.garantiaModel
      .findOneAndUpdate({ _id: id, empresaId: actorEmpresaId }, { ...updateGarantiaDto, empresaId: actorEmpresaId }, { new: true })
      .exec();

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

  async removeGarantia(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const garantia = await this.garantiaModel.findOne({ _id: id, empresaId }).exec();
    if (!garantia) {
      throw new NotFoundException('Garantia nao encontrada.');
    }

    assertCanEditGarantia(garantia.status);
    return this.garantiaModel.findOneAndDelete({ _id: id, empresaId }).exec();
  }

  async createEnvioGarantia(createEnvioGarantiaDto: CreateEnvioGarantiaDto, empresaId?: string) {
    await this.assertGarantiaDaEmpresa(createEnvioGarantiaDto.garantiaId, empresaId);
    const createdEnvioGarantia = new this.envioGarantiaModel(createEnvioGarantiaDto);
    return createdEnvioGarantia.save();
  }

  async findAllEnvioGarantias(empresaId?: string) {
    const garantiaIds = await this.getGarantiaIdsDaEmpresa(empresaId);
    return this.envioGarantiaModel.find({ garantiaId: { $in: garantiaIds } }).exec();
  }

  async findOneEnvioGarantia(id: string, empresaId?: string) {
    const envio = await this.envioGarantiaModel.findById(id).exec();
    if (!envio) return null;
    await this.assertGarantiaDaEmpresa(envio.garantiaId, empresaId);
    return envio;
  }

  async updateEnvioGarantia(id: string, updateEnvioGarantiaDto: UpdateEnvioGarantiaDto, empresaId?: string) {
    const envio = await this.findOneEnvioGarantia(id, empresaId);
    if (!envio) throw new NotFoundException('Envio de garantia nao encontrado.');
    if (updateEnvioGarantiaDto.garantiaId) {
      await this.assertGarantiaDaEmpresa(updateEnvioGarantiaDto.garantiaId, empresaId);
    }
    return this.envioGarantiaModel.findByIdAndUpdate(id, updateEnvioGarantiaDto, { new: true }).exec();
  }

  async removeEnvioGarantia(id: string, empresaId?: string) {
    const envio = await this.findOneEnvioGarantia(id, empresaId);
    if (!envio) throw new NotFoundException('Envio de garantia nao encontrado.');
    return this.envioGarantiaModel.findByIdAndDelete(id).exec();
  }

  async createRetornoGarantia(createRetornoGarantiaDto: CreateRetornoGarantiaDto, empresaId?: string) {
    await this.assertGarantiaDaEmpresa(createRetornoGarantiaDto.garantiaId, empresaId);
    const createdRetornoGarantia = new this.retornoGarantiaModel(createRetornoGarantiaDto);
    return createdRetornoGarantia.save();
  }

  async findAllRetornoGarantias(empresaId?: string) {
    const garantiaIds = await this.getGarantiaIdsDaEmpresa(empresaId);
    return this.retornoGarantiaModel.find({ garantiaId: { $in: garantiaIds } }).exec();
  }

  async findOneRetornoGarantia(id: string, empresaId?: string) {
    const retorno = await this.retornoGarantiaModel.findById(id).exec();
    if (!retorno) return null;
    await this.assertGarantiaDaEmpresa(retorno.garantiaId, empresaId);
    return retorno;
  }

  async updateRetornoGarantia(id: string, updateRetornoGarantDto: UpdateRetornoGarantiaDto, empresaId?: string) {
    const retorno = await this.findOneRetornoGarantia(id, empresaId);
    if (!retorno) throw new NotFoundException('Retorno de garantia nao encontrado.');
    if (updateRetornoGarantDto.garantiaId) {
      await this.assertGarantiaDaEmpresa(updateRetornoGarantDto.garantiaId, empresaId);
    }
    return this.retornoGarantiaModel.findByIdAndUpdate(id, updateRetornoGarantDto, { new: true }).exec();
  }

  async removeRetornoGarantia(id: string, empresaId?: string) {
    const retorno = await this.findOneRetornoGarantia(id, empresaId);
    if (!retorno) throw new NotFoundException('Retorno de garantia nao encontrado.');
    return this.retornoGarantiaModel.findByIdAndDelete(id).exec();
  }

  async createCreditoFornecedor(createCreditoFornecedorDto: CreateCreditoFornecedorDto, empresaId?: string) {
    await this.assertGarantiaDaEmpresa(createCreditoFornecedorDto.garantiaId, empresaId);
    const createdCreditoFornecedor = new this.creditoFornecedorModel(createCreditoFornecedorDto);
    return createdCreditoFornecedor.save();
  }

  async findAllCreditoFornecedores(empresaId?: string) {
    const garantiaIds = await this.getGarantiaIdsDaEmpresa(empresaId);
    return this.creditoFornecedorModel.find({ garantiaId: { $in: garantiaIds } }).exec();
  }

  async findOneCreditoFornecedor(id: string, empresaId?: string) {
    const credito = await this.creditoFornecedorModel.findById(id).exec();
    if (!credito) return null;
    await this.assertGarantiaDaEmpresa(credito.garantiaId, empresaId);
    return credito;
  }

  async updateCreditoFornecedor(id: string, updateCreditoFornecedorDto: UpdateCreditoFornecedorDto, empresaId?: string) {
    const credito = await this.findOneCreditoFornecedor(id, empresaId);
    if (!credito) throw new NotFoundException('Credito de fornecedor nao encontrado.');
    if (updateCreditoFornecedorDto.garantiaId) {
      await this.assertGarantiaDaEmpresa(updateCreditoFornecedorDto.garantiaId, empresaId);
    }
    return this.creditoFornecedorModel.findByIdAndUpdate(id, updateCreditoFornecedorDto, { new: true }).exec();
  }

  async removeCreditoFornecedor(id: string, empresaId?: string) {
    const credito = await this.findOneCreditoFornecedor(id, empresaId);
    if (!credito) throw new NotFoundException('Credito de fornecedor nao encontrado.');
    return this.creditoFornecedorModel.findByIdAndDelete(id).exec();
  }

  private async assertGarantiaDaEmpresa(garantiaId: unknown, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const garantia = await this.garantiaModel.findOne({ _id: String(garantiaId), empresaId }).select('_id').lean().exec();
    if (!garantia) {
      throw new NotFoundException('Garantia nao encontrada.');
    }
  }

  private async getGarantiaIdsDaEmpresa(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const garantias = await this.garantiaModel.find({ empresaId }).select('_id').lean().exec();
    return garantias.map((garantia) => garantia._id);
  }

  private getEmpresaIdPermitida(inputEmpresaId: unknown, userEmpresaId?: string) {
    if (userEmpresaId) {
      if (inputEmpresaId && String(inputEmpresaId) !== String(userEmpresaId)) {
        throw new UnauthorizedException('Empresa informada nao pertence ao usuario.');
      }
      return userEmpresaId;
    }

    if (!inputEmpresaId) {
      throw new UnauthorizedException('Empresa da garantia nao informada.');
    }

    return String(inputEmpresaId);
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
