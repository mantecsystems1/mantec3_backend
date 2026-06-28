import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from './schemas/cliente.schema';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectModel(Cliente.name) private clienteModel: Model<ClienteDocument>,
  ) {}

  create(createClienteDto: CreateClienteDto) {
    if (!Types.ObjectId.isValid(createClienteDto.empresaId)) {
      throw new BadRequestException('Empresa invalida para o cadastro do cliente');
    }

    const createdCliente = new this.clienteModel(createClienteDto);
    return createdCliente.save();
  }

  findAll() {
    return this.clienteModel.find().exec();
  }

  findOne(id: string) {
    return this.clienteModel.findById(id).exec();
  }

  update(id: string, updateClienteDto: UpdateClienteDto) {
    return this.clienteModel.findByIdAndUpdate(id, updateClienteDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.clienteModel.findByIdAndDelete(id).exec();
  }
}
