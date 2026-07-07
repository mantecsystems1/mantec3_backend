import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Servico, ServicoDocument } from './schemas/servico.schema';
import { CreateServicoDto } from './dto/create-servico.dto';
import { UpdateServicoDto } from './dto/update-servico.dto';

@Injectable()
export class ServicosService {
  constructor(
    @InjectModel(Servico.name) private servicoModel: Model<ServicoDocument>,
  ) {}

  create(createServicoDto: CreateServicoDto) {
    const servicoData: any = { ...createServicoDto };
    if (
      createServicoDto.precoPadrao !== undefined &&
      createServicoDto.precoPadrao !== null &&
      createServicoDto.precoPadrao !== ''
    ) {
      try {
        const precoStr = String(createServicoDto.precoPadrao).replace(',', '.');
        if (!/^-?\d+(\.\d+)?$/.test(precoStr)) {
          throw new Error('Formato inválido para precoPadrao');
        }
        servicoData.precoPadrao = Types.Decimal128.fromString(precoStr);
      } catch (err) {
        throw new BadRequestException('precoPadrao inválido');
      }
    }
    const createdServico = new this.servicoModel(servicoData);
    return createdServico.save();
  }

  findAll() {
    return this.servicoModel.find().exec();
  }

  findOne(id: string) {
    return this.servicoModel.findById(id).exec();
  }

  update(id: string, updateServicoDto: UpdateServicoDto) {
    const updateData: any = { ...updateServicoDto };
    if (
      updateServicoDto.precoPadrao !== undefined &&
      updateServicoDto.precoPadrao !== null &&
      updateServicoDto.precoPadrao !== ''
    ) {
      try {
        const precoStr = String(updateServicoDto.precoPadrao).replace(',', '.');
        if (!/^-?\d+(\.\d+)?$/.test(precoStr)) {
          throw new Error('Formato inválido para precoPadrao');
        }
        updateData.precoPadrao = Types.Decimal128.fromString(precoStr);
      } catch (err) {
        throw new BadRequestException('precoPadrao inválido');
      }
    }
    return this.servicoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  remove(id: string) {
    return this.servicoModel.findByIdAndDelete(id).exec();
  }
}
