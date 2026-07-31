import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Orcamento, OrcamentoDocument } from './schemas/orcamento.schema';
import { ItensOrcamento, ItensOrcamentoDocument } from './schemas/itens-orcamento.schema';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';
import { assertCanEditOrcamento, assertCanTransitionOrcamento } from './state/orcamento.transitions';
import { ORCAMENTO_STATUS, isOrcamentoStatus } from './state/orcamento.states';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { OsService } from '../ordens-servico/os.service';
import { OS_STATUS } from '../ordens-servico/state/os.states';

@Injectable()
export class OrcamentosService {
  constructor(
    @InjectModel(Orcamento.name) private orcamentoModel: Model<OrcamentoDocument>,
    @InjectModel(ItensOrcamento.name) private itensOrcamentoModel: Model<ItensOrcamentoDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly osService: OsService,
  ) {}

  async create(createOrcamentoDto: CreateOrcamentoDto) {
    if (!isOrcamentoStatus(createOrcamentoDto.status)) {
      throw new BadRequestException(`Status de orcamento invalido: ${createOrcamentoDto.status}`);
    }

    const orcamentoData: Record<string, unknown> = { ...createOrcamentoDto };
    if (createOrcamentoDto.subtotal) {
      orcamentoData.subtotal = Types.Decimal128.fromString(String(createOrcamentoDto.subtotal));
    }
    if (createOrcamentoDto.descontos) {
      orcamentoData.descontos = Types.Decimal128.fromString(String(createOrcamentoDto.descontos));
    }
    if (createOrcamentoDto.total) {
      orcamentoData.total = Types.Decimal128.fromString(String(createOrcamentoDto.total));
    }
    const createdOrcamento = new this.orcamentoModel(orcamentoData);
    const saved = await createdOrcamento.save();

    await this.auditoriaService.registrarEventoNegocio({
      empresaId: createOrcamentoDto.empresaId,
      usuarioId: createOrcamentoDto.criadoPor,
      tipoEvento: AUDITORIA_EVENTOS.ORCAMENTO_CRIADO,
      entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
      entidadeId: saved._id as Types.ObjectId,
      dados: {
        status: createOrcamentoDto.status,
        clienteId: createOrcamentoDto.clienteId,
        total: createOrcamentoDto.total,
      },
    });

    return saved;
  }

  findAll() {
    return this.orcamentoModel
      .find()
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('criadoPor', 'nome email')
      .exec();
  }

  findOne(id: string) {
    return this.orcamentoModel
      .findById(id)
      .populate('empresaId', 'nomeFantasia razaoSocial')
      .populate('clienteId', 'nome cpfCnpj')
      .populate('recebimentoEquipamentoId', 'tipoEquipamento marca modelo imeiOuSerial')
      .populate('criadoPor', 'nome email')
      .exec();
  }

  async update(id: string, updateOrcamentoDto: UpdateOrcamentoDto) {
    const orcamento = await this.orcamentoModel.findById(id).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    const nextStatus = updateOrcamentoDto.status;
    const hasNonStatusChanges = Object.keys(updateOrcamentoDto).some((key) => key !== 'status');

    if (nextStatus) {
      assertCanTransitionOrcamento(orcamento.status, nextStatus);
    }

    if (hasNonStatusChanges) {
      assertCanEditOrcamento(orcamento.status);
    }

    const updateData: Record<string, unknown> = { ...updateOrcamentoDto };
    if (updateOrcamentoDto.subtotal) {
      updateData.subtotal = Types.Decimal128.fromString(String(updateOrcamentoDto.subtotal));
    }
    if (updateOrcamentoDto.descontos) {
      updateData.descontos = Types.Decimal128.fromString(String(updateOrcamentoDto.descontos));
    }
    if (updateOrcamentoDto.total) {
      updateData.total = Types.Decimal128.fromString(String(updateOrcamentoDto.total));
    }
    const updated = await this.orcamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();

    if (nextStatus && nextStatus !== orcamento.status) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: orcamento.empresaId,
        usuarioId: orcamento.criadoPor,
        tipoEvento: this.getOrcamentoAuditEvent(nextStatus),
        entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
        entidadeId: orcamento._id as Types.ObjectId,
        dados: {
          statusAnterior: orcamento.status,
          statusAtual: nextStatus,
        },
      });
    }

    return updated;
  }

  async remove(id: string) {
    const orcamento = await this.orcamentoModel.findById(id).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    assertCanEditOrcamento(orcamento.status);
    return this.orcamentoModel.findByIdAndDelete(id).exec();
  }

  async gerarOrdemServico(id: string, user?: CurrentUserPayload) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Orcamento invalido.');
    }

    const orcamento = await this.orcamentoModel.findById(id).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    if (user?.empresaId && String(orcamento.empresaId) !== user.empresaId) {
      throw new UnauthorizedException('Orcamento nao pertence a empresa do usuario.');
    }

    if (orcamento.status !== ORCAMENTO_STATUS.APROVADO) {
      throw new BadRequestException('Apenas orcamento aprovado pode gerar ordem de servico.');
    }

    const existente = await this.osService.findByOrcamento(id);
    if (existente) {
      return existente;
    }

    const tecnicoId = user?.id || user?._id || user?.sub || String(orcamento.criadoPor);

    return this.osService.create({
      empresaId: String(orcamento.empresaId),
      clienteId: String(orcamento.clienteId),
      tecnicoId,
      orcamentoId: id,
      recebimentoEquipamentoId: String(orcamento.recebimentoEquipamentoId),
      statusOperacional: OS_STATUS.ABERTA,
      prioridade: 'normal',
      dataEntrada: new Date().toISOString(),
    });
  }

  async createItem(createItensOrcamentoDto: CreateItensOrcamentoDto) {
    await this.assertOrcamentoCanReceiveItem(createItensOrcamentoDto.orcamentoId);

    const itemData: Record<string, unknown> = { ...createItensOrcamentoDto };
    if (createItensOrcamentoDto.valorUnitario) {
      itemData.valorUnitario = Types.Decimal128.fromString(String(createItensOrcamentoDto.valorUnitario));
    }
    if (createItensOrcamentoDto.totalItem) {
      itemData.totalItem = Types.Decimal128.fromString(String(createItensOrcamentoDto.totalItem));
    }
    const createdItem = new this.itensOrcamentoModel(itemData);
    return createdItem.save();
  }

  findAllItems() {
    return this.itensOrcamentoModel.find().exec();
  }

  findItemsByOrcamento(orcamentoId: string) {
    return this.itensOrcamentoModel.find({ orcamentoId }).exec();
  }

  findOneItem(id: string) {
    return this.itensOrcamentoModel.findById(id).exec();
  }

  async updateItem(id: string, updateItensOrcamentoDto: UpdateItensOrcamentoDto) {
    const item = await this.itensOrcamentoModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de orcamento nao encontrado.');
    }

    await this.assertOrcamentoCanReceiveItem(item.orcamentoId.toString());

    const updateData: Record<string, unknown> = { ...updateItensOrcamentoDto };
    if (updateItensOrcamentoDto.valorUnitario) {
      updateData.valorUnitario = Types.Decimal128.fromString(String(updateItensOrcamentoDto.valorUnitario));
    }
    if (updateItensOrcamentoDto.totalItem) {
      updateData.totalItem = Types.Decimal128.fromString(String(updateItensOrcamentoDto.totalItem));
    }
    return this.itensOrcamentoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async removeItem(id: string) {
    const item = await this.itensOrcamentoModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Item de orcamento nao encontrado.');
    }

    await this.assertOrcamentoCanReceiveItem(item.orcamentoId.toString());
    return this.itensOrcamentoModel.findByIdAndDelete(id).exec();
  }

  private async assertOrcamentoCanReceiveItem(orcamentoId: string) {
    const orcamento = await this.orcamentoModel.findById(orcamentoId).exec();
    if (!orcamento) {
      throw new NotFoundException('Orcamento nao encontrado.');
    }

    assertCanEditOrcamento(orcamento.status);
  }

  private getOrcamentoAuditEvent(status: string) {
    switch (status) {
      case ORCAMENTO_STATUS.ENVIADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_ENVIADO;
      case ORCAMENTO_STATUS.APROVADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_APROVADO;
      case ORCAMENTO_STATUS.REJEITADO:
      case ORCAMENTO_STATUS.REPROVADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_REPROVADO;
      case ORCAMENTO_STATUS.CANCELADO:
        return AUDITORIA_EVENTOS.ORCAMENTO_CANCELADO;
      default:
        return AUDITORIA_EVENTOS.ORCAMENTO_CRIADO;
    }
  }
}
