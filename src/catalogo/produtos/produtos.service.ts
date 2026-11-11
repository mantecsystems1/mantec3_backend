import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Produto, ProdutoDocument } from './schemas/produto.schema';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';
import { centavosParaDecimal128, dinheiroParaCentavos } from '../../financeiro/financeiro-adm/financeiro-adm.types';
import { buscaLiteralRegex, lerConsultaListaOperacional, respostaListaOperacional } from '../../common/paginacao-operacional';

@Injectable()
export class ProdutosService {
  constructor(
    @InjectModel(Produto.name) private produtoModel: Model<ProdutoDocument>,
  ) {}

  create(createProdutoDto: CreateProdutoDto, empresaId?: string) {
    this.assertEmpresaPermitida(createProdutoDto.empresaId, empresaId);
    const produtoData = this.montarProdutoData(createProdutoDto);
    if (empresaId) {
      produtoData.empresaId = empresaId;
    }
    const createdProduto = new this.produtoModel(produtoData);
    return createdProduto.save();
  }

  findAll(empresaId?: string) {
    return this.produtoModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .populate('aparelhoModeloId', 'marca modelo aliases')
      .exec();
  }

  /** Lista paginada de produtos ativos: busca por nome, código interno, tipo ou cor. */
  async findAllPaginado(empresaId: string | undefined, query: Record<string, unknown>) {
    // Nunca listar sem empresa: getEmpresaQuery sem empresaId não filtraria por empresa.
    if (!empresaId) throw new UnauthorizedException('Empresa do usuario nao informada.');
    const consulta = lerConsultaListaOperacional(query);
    const filtro: Record<string, unknown> = { ativo: { $ne: false } };
    if (consulta.busca) {
      const texto = buscaLiteralRegex(consulta.busca);
      filtro.$or = [{ nome: texto }, { codigoInterno: texto }, { tipoProduto: texto }, { cor: texto }];
    }
    const condicao = this.getEmpresaQuery(empresaId, filtro);
    const [itens, total] = await Promise.all([
      this.produtoModel.find(condicao).sort({ nome: 1, _id: 1 })
        .skip((consulta.pagina - 1) * consulta.limite).limit(consulta.limite)
        .populate('aparelhoModeloId', 'marca modelo aliases').exec(),
      this.produtoModel.countDocuments(condicao).exec(),
    ]);
    return respostaListaOperacional(itens, total, consulta);
  }

  findOne(id: string, empresaId?: string) {
    return this.produtoModel
      .findOne(this.getEmpresaQuery(empresaId, { _id: id }))
      .populate('aparelhoModeloId', 'marca modelo aliases')
      .exec();
  }

  update(id: string, updateProdutoDto: UpdateProdutoDto, empresaId?: string) {
    this.assertEmpresaPermitida(updateProdutoDto.empresaId, empresaId);
    const updateData = this.montarProdutoData(updateProdutoDto);
    delete updateData.empresaId;
    return this.produtoModel
      .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: id }), updateData, { new: true })
      .exec();
  }

  remove(id: string, empresaId?: string) {
    return this.produtoModel
      .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: id }), { ativo: false }, { new: true })
      .exec();
  }

  private montarProdutoData(dto: CreateProdutoDto | UpdateProdutoDto) {
    const produtoData: Record<string, unknown> = { ...dto };

    if (this.hasValue(dto.precoVenda)) {
      produtoData.precoVenda = centavosParaDecimal128(this.parseValorNaoNegativoCentavos(dto.precoVenda, 'precoVenda'));
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

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    return empresaId ? { ...base, empresaId } : base;
  }

  private assertEmpresaPermitida(dtoEmpresaId?: string, actorEmpresaId?: string) {
    if (actorEmpresaId && dtoEmpresaId && String(dtoEmpresaId) !== String(actorEmpresaId)) {
      throw new BadRequestException('Produto nao pode ser vinculado a outra empresa.');
    }
  }

  private parseValorNaoNegativoCentavos(value: unknown, campo: string) {
    const centavos = dinheiroParaCentavos(value);
    if (!Number.isFinite(centavos) || centavos < 0) {
      throw new BadRequestException(`${campo} invalido.`);
    }

    return centavos;
  }
}
