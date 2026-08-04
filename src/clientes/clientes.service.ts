import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from './schemas/cliente.schema';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';

type ClienteAuditavelEvento =
  | typeof AUDITORIA_EVENTOS.CLIENTE_CRIADO
  | typeof AUDITORIA_EVENTOS.CLIENTE_ATUALIZADO
  | typeof AUDITORIA_EVENTOS.CLIENTE_REMOVIDO
  | typeof AUDITORIA_EVENTOS.CLIENTE_DESATIVADO;

@Injectable()
export class ClientesService {
  constructor(
    @InjectModel(Cliente.name) private clienteModel: Model<ClienteDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createClienteDto: CreateClienteDto, actorId?: string) {
    if (!Types.ObjectId.isValid(createClienteDto.empresaId)) {
      throw new BadRequestException('Empresa invalida para o cadastro do cliente');
    }

    const createdCliente = new this.clienteModel(createClienteDto);
    const saved = await createdCliente.save();

    if (actorId) {
      await this.registrarAuditoriaCliente(saved, actorId, AUDITORIA_EVENTOS.CLIENTE_CRIADO, {
        nome: createClienteDto.nome,
        cpfCnpj: createClienteDto.cpfCnpj,
        email: createClienteDto.email,
        telefone: createClienteDto.telefone,
      });
    }

    return saved;
  }

  findAll() {
    return this.clienteModel.find().exec();
  }

  findOne(id: string) {
    return this.clienteModel.findById(id).exec();
  }

  async update(id: string, updateClienteDto: UpdateClienteDto, actorId?: string) {
    const updated = await this.clienteModel.findByIdAndUpdate(id, updateClienteDto, { new: true }).exec();

    if (actorId && updated) {
      await this.registrarAuditoriaCliente(updated, actorId, AUDITORIA_EVENTOS.CLIENTE_ATUALIZADO, {
        camposAlterados: Object.keys(updateClienteDto),
      });
    }

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const removed = await this.clienteModel.findByIdAndUpdate(id, { ativo: false }, { new: true }).exec();

    if (actorId && removed) {
      await this.registrarAuditoriaCliente(removed, actorId, AUDITORIA_EVENTOS.CLIENTE_DESATIVADO, {
        nome: removed.nome,
        cpfCnpj: removed.cpfCnpj,
        ativo: false,
      });
    }

    return removed;
  }

  private async registrarAuditoriaCliente(
    cliente: ClienteDocument,
    actorId: string,
    tipoEvento: ClienteAuditavelEvento,
    dados: Record<string, unknown>,
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: cliente.empresaId,
      usuarioId: actorId,
      tipoEvento,
      entidade: AUDITORIA_ENTIDADES.CLIENTE,
      entidadeId: cliente._id as Types.ObjectId,
      dados,
    });
  }
}
