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
    const produtoData = this.montarProdutoData(createProdutoDto);
    const createdProduto = new this.produtoModel(produtoData);
    return createdProduto.save();
  }

  findAll() {
    return this.produtoModel.find().populate('aparelhoModeloId', 'marca modelo aliases').exec();
  }

  findOne(id: string) {
    return this.produtoModel.findById(id).populate('aparelhoModeloId', 'marca modelo aliases').exec();
  }

  update(id: string, updateProdutoDto: UpdateProdutoDto) {
    const updateData = this.montarProdutoData(updateProdutoDto);
    return this.produtoModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  remove(id: string) {
    return this.produtoModel.findByIdAndDelete(id).exec();
  }

  private montarProdutoData(dto: CreateProdutoDto | UpdateProdutoDto) {
    const produtoData: Record<string, unknown> = { ...dto };

    if (this.hasValue(dto.precoVenda)) {
      produtoData.precoVenda = Types.Decimal128.fromString(String(dto.precoVenda));
    } else {
      delete produtoData.precoVenda;
    }

    if (typeof produtoData.ativo === 'string') {
      produtoData.ativo = produtoData.ativo === 'true';
    }

    if (typeof produtoData.fotoTamanhoBytes === 'string') {
      produtoData.fotoTamanhoBytes = Number(produtoData.fotoTamanhoBytes);
    }

    if (this.hasValue(dto.aparelhoModeloId)) {
      produtoData.aparelhoModeloId = dto.aparelhoModeloId;
    } else {
      delete produtoData.aparelhoModeloId;
    }

    if (typeof dto.fotoUrl === 'string') {
      produtoData.fotoUrl = this.normalizarFotoUrl(dto.fotoUrl);
    }

    if (dto.fotoCapturadaEm) {
      const data = new Date(dto.fotoCapturadaEm);
      if (!Number.isNaN(data.getTime())) {
        produtoData.fotoCapturadaEm = data;
      }
    }

    return produtoData;
  }

  private hasValue(value: unknown) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  private normalizarFotoUrl(fotoUrl: string) {
    const value = String(fotoUrl ?? '').trim().replace(/\\/g, '/');
    if (!value || /^https?:\/\//i.test(value)) {
      return value;
    }

    const clean = value
      .replace(/^\/+/, '')
      .replace(/^(uploads\/)+/i, 'uploads/');

    return clean.startsWith('uploads/') ? `/${clean}` : `/uploads/${clean}`;
  }
}
