import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Produto, ProdutoDocument } from './schemas/produto.schema';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';

@Injectable()
export class ProdutosService {
  constructor(
    @InjectModel(Produto.name) private produtoModel: Model<ProdutoDocument>,
  ) {}

  create(createProdutoDto: CreateProdutoDto) {
    const produtoData: any = { ...createProdutoDto };
    if (createProdutoDto.precoVenda) {
      produtoData.precoVenda = Types.Decimal128.fromString(String(createProdutoDto.precoVenda));
    }
    const createdProduto = new this.produtoModel(produtoData);
    return createdProduto.save();
  }

  findAll() {
    return this.produtoModel.find().exec();
  }

  findOne(id: string) {
    return this.produtoModel.findById(id).exec();
  }

  update(id: string, updateProdutoDto: UpdateProdutoDto) {
    const updateData: any = { ...updateProdutoDto };
    if (updateProdutoDto.precoVenda) {
      updateData.precoVenda = Types.Decimal128.fromString(String(updateProdutoDto.precoVenda));
    }
    return this.produtoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  remove(id: string) {
    return this.produtoModel.findByIdAndDelete(id).exec();
  }
}
