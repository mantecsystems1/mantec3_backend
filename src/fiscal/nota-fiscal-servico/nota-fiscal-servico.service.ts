import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotaFiscalServico, NotaFiscalServicoDocument } from './nota-fiscal-servico.schema';
import { CreateNotaFiscalServicoDto } from './dto/create-nota-fiscal-servico.dto';
import { UpdateNotaFiscalServicoDto } from './dto/update-nota-fiscal-servico.dto';

@Injectable()
export class NotaFiscalServicoService {
  constructor(
    @InjectModel(NotaFiscalServico.name) private notaFiscalServicoModel: Model<NotaFiscalServicoDocument>,
  ) {}

  create(createNotaFiscalServicoDto: CreateNotaFiscalServicoDto) {
    const createdNotaFiscalServico = new this.notaFiscalServicoModel(createNotaFiscalServicoDto);
    return createdNotaFiscalServico.save();
  }

  findAll() {
    return this.notaFiscalServicoModel
      .find()
      .populate({
        path: 'vendaId',
        populate: { path: 'clienteId', select: 'nome cpfCnpj' },
      })
      .exec();
  }

  findOne(id: string) {
    return this.notaFiscalServicoModel
      .findById(id)
      .populate({
        path: 'vendaId',
        populate: { path: 'clienteId', select: 'nome cpfCnpj' },
      })
      .exec();
  }

  update(id: string, updateNotaFiscalServicoDto: UpdateNotaFiscalServicoDto) {
    return this.notaFiscalServicoModel.findByIdAndUpdate(id, updateNotaFiscalServicoDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.notaFiscalServicoModel.findByIdAndDelete(id).exec();
  }
}