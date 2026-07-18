import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MovimentosEstoque, MovimentosEstoqueDocument } from './schemas/movimento-estoque.schema';
import { CreateMovimentoEstoqueDto } from './dto/create-movimento-estoque.dto';
import { UpdateMovimentoEstoqueDto } from './dto/update-movimento-estoque.dto';

@Injectable()
export class EstoqueService {
  constructor(
    @InjectModel(MovimentosEstoque.name) private movimentosEstoqueModel: Model<MovimentosEstoqueDocument>,
  ) {}

  create(createMovimentoEstoqueDto: CreateMovimentoEstoqueDto) {
    const createdMovimento = new this.movimentosEstoqueModel(createMovimentoEstoqueDto);
    return createdMovimento.save();
  }

  findAll() {
    return this.movimentosEstoqueModel
      .find()
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  findOne(id: string) {
    return this.movimentosEstoqueModel
      .findById(id)
      .populate('produtoId', 'nome codigoInterno precoVenda')
      .exec();
  }

  update(id: string, updateMovimentoEstoqueDto: UpdateMovimentoEstoqueDto) {
    return this.movimentosEstoqueModel.findByIdAndUpdate(id, updateMovimentoEstoqueDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.movimentosEstoqueModel.findByIdAndDelete(id).exec();
  }
}
