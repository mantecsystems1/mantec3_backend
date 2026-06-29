import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Empresa, EmpresaDocument } from './schemas/empresa.schema';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';

@Injectable()
export class EmpresaService {
  constructor(
    @InjectModel(Empresa.name)
    private empresaModel: Model<EmpresaDocument>,
  ) {}

  create(data: CreateEmpresaDto) {
    return this.empresaModel.create(data);
  }

  findAll() {
    return this.empresaModel.find();
  }

  findOne(id: string) {
    return this.empresaModel.findById(id).exec();
  }

  update(id: string, data: UpdateEmpresaDto) {
    return this.empresaModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  remove(id: string) {
    return this.empresaModel.findByIdAndDelete(id).exec();
  }
}
