import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CompatibilidadeProduto,
  CompatibilidadeProdutoDocument,
} from './schemas/compatibilidade-produto.schema';
import { AparelhoModelo, AparelhoModeloDocument } from './schemas/aparelho-modelo.schema';
import { CompatibilidadeModelo, CompatibilidadeModeloDocument } from './schemas/compatibilidade-modelo.schema';
import { CreateCompatibilidadeProdutoDto } from './dto/create-compatibilidade-produto.dto';
import { UpdateCompatibilidadeProdutoDto } from './dto/update-compatibilidade-produto.dto';
import { CreateAparelhoModeloDto } from './dto/create-aparelho-modelo.dto';
import { UpdateAparelhoModeloDto } from './dto/update-aparelho-modelo.dto';
import { CreateCompatibilidadeModeloDto } from './dto/create-compatibilidade-modelo.dto';
import { UpdateCompatibilidadeModeloDto } from './dto/update-compatibilidade-modelo.dto';
import { ImportCompatibilidadePeliculasDto } from './dto/import-compatibilidade-peliculas.dto';
import { Produto, ProdutoDocument } from '../produtos/schemas/produto.schema';
import { MovimentosEstoque, MovimentosEstoqueDocument } from '../../estoque/schemas/movimento-estoque.schema';
import { OrdemServico, OrdemServicoDocument } from '../../ordens-servico/schemas/ordem-servico.schema';
import {
  RecebimentoEquipamento,
  RecebimentoEquipamentoDocument,
} from '../../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { calcularDisponibilidadeMovimentos } from '../../estoque/movimento-estoque.types';

interface SugestoesPeliculasParams {
  empresaId?: string;
  marca?: string;
  modelo?: string;
  origemTipo?: string;
  origemId?: string;
}

interface ModeloImportado {
  marca: string;
  modelo: string;
  alias: string;
}

@Injectable()
export class CompatibilidadeService {
  constructor(
    @InjectModel(CompatibilidadeProduto.name)
    private compatibilidadeModel: Model<CompatibilidadeProdutoDocument>,
    @InjectModel(AparelhoModelo.name)
    private aparelhoModeloModel: Model<AparelhoModeloDocument>,
    @InjectModel(CompatibilidadeModelo.name)
    private compatibilidadeModeloModel: Model<CompatibilidadeModeloDocument>,
    @InjectModel(Produto.name)
    private produtoModel: Model<ProdutoDocument>,
    @InjectModel(MovimentosEstoque.name)
    private movimentosEstoqueModel: Model<MovimentosEstoqueDocument>,
    @InjectModel(OrdemServico.name)
    private ordemServicoModel: Model<OrdemServicoDocument>,
    @InjectModel(RecebimentoEquipamento.name)
    private recebimentoEquipamentoModel: Model<RecebimentoEquipamentoDocument>,
  ) {}

  create(createDto: CreateCompatibilidadeProdutoDto) {
    const created = new this.compatibilidadeModel(createDto);
    return created.save();
  }

  findAll() {
    return this.compatibilidadeModel.find().exec();
  }

  // Find all compatibilities for a given product
  findAllByProduto(produtoId: string) {
    return this.compatibilidadeModel.find({ produtoId }).exec();
  }

  findOne(id: string) {
    return this.compatibilidadeModel.findById(id).exec();
  }

  update(id: string, updateDto: UpdateCompatibilidadeProdutoDto) {
    return this.compatibilidadeModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.compatibilidadeModel.findByIdAndDelete(id).exec();
  }

  async importarCompatibilidadePeliculas(importDto: ImportCompatibilidadePeliculasDto) {
    const linhas = this.getLinhasImportacao(importDto);
    const resultado = {
      linhasRecebidas: linhas.length,
      linhasImportadas: 0,
      linhasIgnoradas: 0,
      modelosCriados: 0,
      modelosAtualizados: 0,
      relacoesCriadas: 0,
      relacoesExistentes: 0,
      erros: [] as string[],
    };

    for (const linha of linhas) {
      const parsed = this.parseLinhaCompatibilidade(linha);
      if (!parsed) {
        resultado.linhasIgnoradas += 1;
        continue;
      }

      try {
        const baseInput = this.parseModeloImportado(parsed.base);
        if (!baseInput) {
          resultado.linhasIgnoradas += 1;
          resultado.erros.push(`Modelo base invalido: ${linha}`);
          continue;
        }

        const base = await this.findOrCreateModeloImportado(baseInput, importDto.empresaId);
        if (base.created) {
          resultado.modelosCriados += 1;
        } else if (base.updated) {
          resultado.modelosAtualizados += 1;
        }

        for (const compatText of parsed.compatibilidades) {
          const compatInput = this.parseModeloImportado(compatText, baseInput.marca);
          if (!compatInput) {
            continue;
          }

          const compat = await this.findOrCreateModeloImportado(compatInput, importDto.empresaId);
          if (compat.created) {
            resultado.modelosCriados += 1;
          } else if (compat.updated) {
            resultado.modelosAtualizados += 1;
          }

          const relacao = await this.findOrCreateRelacaoImportada(String(base.modelo._id), String(compat.modelo._id), importDto.empresaId);
          if (relacao.created) {
            resultado.relacoesCriadas += 1;
          } else {
            resultado.relacoesExistentes += 1;
          }
        }

        resultado.linhasImportadas += 1;
      } catch (err) {
        resultado.erros.push(err instanceof Error ? err.message : `Erro ao importar linha: ${linha}`);
      }
    }

    return resultado;
  }

  async classificarProdutosExistentes(empresaId?: string) {
    const produtos = await this.produtoModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .exec();
    const modelos = await this.aparelhoModeloModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .lean()
      .exec();
    const resultado = {
      produtosAnalisados: produtos.length,
      produtosAtualizados: 0,
      produtosSemModelo: 0,
      produtosSemTipo: 0,
    };

    for (const produto of produtos) {
      const nomeNormalizado = this.normalizarTexto(produto.nome);
      const tipoProduto = produto.tipoProduto || this.detectarTipoProduto(nomeNormalizado);
      const modelo = this.findModeloContidoNoTexto(nomeNormalizado, modelos);
      const update: Record<string, unknown> = {};

      if (!produto.tipoProduto && tipoProduto) {
        update.tipoProduto = tipoProduto;
      } else if (!produto.tipoProduto) {
        resultado.produtosSemTipo += 1;
      }

      if (!produto.aparelhoModeloId && modelo) {
        update.aparelhoModeloId = modelo._id;
      } else if (!produto.aparelhoModeloId) {
        resultado.produtosSemModelo += 1;
      }

      if (!produto.qualidade) {
        const qualidade = this.detectarQualidade(nomeNormalizado);
        if (qualidade) update.qualidade = qualidade;
      }

      if (!produto.temAro) {
        const aro = this.detectarAro(nomeNormalizado);
        if (aro) update.temAro = aro;
      }

      if (!produto.cor) {
        const cor = this.detectarCor(nomeNormalizado);
        if (cor) update.cor = cor;
      }

      if (Object.keys(update).length > 0) {
        await this.produtoModel.updateOne({ _id: produto._id }, { $set: update }).exec();
        resultado.produtosAtualizados += 1;
      }
    }

    return resultado;
  }

  createModelo(createDto: CreateAparelhoModeloDto) {
    const data = this.montarModeloData(createDto);
    const created = new this.aparelhoModeloModel(data);
    return created.save();
  }

  findAllModelos(empresaId?: string) {
    return this.aparelhoModeloModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .sort({ marca: 1, modelo: 1 })
      .exec();
  }

  findOneModelo(id: string) {
    return this.aparelhoModeloModel.findById(id).exec();
  }

  updateModelo(id: string, updateDto: UpdateAparelhoModeloDto) {
    const data = this.montarModeloData(updateDto);
    return this.aparelhoModeloModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  removeModelo(id: string) {
    return this.aparelhoModeloModel.findByIdAndDelete(id).exec();
  }

  createCompatibilidadeModelo(createDto: CreateCompatibilidadeModeloDto) {
    const created = new this.compatibilidadeModeloModel({
      ...createDto,
      tipoProduto: createDto.tipoProduto || 'pelicula',
    });
    return created.save();
  }

  findAllCompatibilidadesModelo(empresaId?: string) {
    return this.compatibilidadeModeloModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .populate('modeloBaseId', 'marca modelo aliases')
      .populate('modeloCompativelId', 'marca modelo aliases')
      .sort({ tipoProduto: 1, criadoEm: -1 })
      .exec();
  }

  findOneCompatibilidadeModelo(id: string) {
    return this.compatibilidadeModeloModel
      .findById(id)
      .populate('modeloBaseId', 'marca modelo aliases')
      .populate('modeloCompativelId', 'marca modelo aliases')
      .exec();
  }

  updateCompatibilidadeModelo(id: string, updateDto: UpdateCompatibilidadeModeloDto) {
    return this.compatibilidadeModeloModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
  }

  removeCompatibilidadeModelo(id: string) {
    return this.compatibilidadeModeloModel.findByIdAndDelete(id).exec();
  }

  async getSugestoesPeliculas(params: SugestoesPeliculasParams) {
    const equipamento = await this.getEquipamentoConsulta(params);
    const empresaId = params.empresaId || equipamento?.empresaId?.toString();

    if (!equipamento?.marca || !equipamento?.modelo) {
      throw new BadRequestException('Informe marca/modelo ou uma ordem de servico com equipamento vinculado.');
    }

    const modeloBase = await this.findModeloPorTexto(equipamento.marca, equipamento.modelo, empresaId);
    if (!modeloBase) {
      return {
        encontrado: false,
        equipamento,
        modeloBase: null,
        sugestoes: [],
        mensagem: 'Modelo do aparelho ainda nao cadastrado para compatibilidade de pelicula.',
      };
    }

    const compatibilidades = await this.compatibilidadeModeloModel
      .find(this.getEmpresaQuery(empresaId, {
        tipoProduto: 'pelicula',
        ativo: { $ne: false },
        $or: [
          { modeloBaseId: modeloBase._id },
          { modeloCompativelId: modeloBase._id },
        ],
      }))
      .lean()
      .exec();

    const modeloIds = new Set<string>([String(modeloBase._id)]);
    compatibilidades.forEach((compatibilidade) => {
      modeloIds.add(String(compatibilidade.modeloBaseId));
      modeloIds.add(String(compatibilidade.modeloCompativelId));
    });

    const produtos = await this.produtoModel
      .find({
        ...this.getEmpresaQuery(empresaId),
        tipoProduto: 'pelicula',
        aparelhoModeloId: { $in: Array.from(modeloIds).map((id) => new Types.ObjectId(id)) },
        ativo: { $ne: false },
      })
      .populate('aparelhoModeloId', 'marca modelo aliases')
      .lean()
      .exec();

    const produtoIds = produtos.map((produto) => produto._id);
    const movimentos = await this.movimentosEstoqueModel
      .find({ produtoId: { $in: produtoIds } })
      .lean()
      .exec();

    const movimentosPorProduto = movimentos.reduce<Record<string, typeof movimentos>>((acc, movimento) => {
      const key = String(movimento.produtoId);
      acc[key] = acc[key] || [];
      acc[key].push(movimento);
      return acc;
    }, {});

    const sugestoes = produtos
      .map((produto) => {
        const disponibilidade = calcularDisponibilidadeMovimentos(movimentosPorProduto[String(produto._id)] || []);
        const modeloProdutoId = String(produto.aparelhoModeloId?._id || produto.aparelhoModeloId);
        return {
          produtoId: produto._id,
          produto,
          relacao: modeloProdutoId === String(modeloBase._id) ? 'direta' : 'compativel',
          saldoFisico: disponibilidade.saldoFisico,
          reservado: disponibilidade.reservado,
          disponivel: disponibilidade.disponivel,
        };
      })
      .filter((sugestao) => sugestao.disponivel > 0)
      .sort((a, b) => {
        if (a.relacao !== b.relacao) {
          return a.relacao === 'direta' ? -1 : 1;
        }
        return b.disponivel - a.disponivel;
      });

    return {
      encontrado: true,
      equipamento,
      modeloBase,
      sugestoes,
      mensagem: sugestoes.length
        ? 'Ha peliculas compativeis disponiveis em estoque.'
        : 'Modelo encontrado, mas sem pelicula compativel disponivel em estoque.',
    };
  }

  private montarModeloData(dto: CreateAparelhoModeloDto | UpdateAparelhoModeloDto) {
    const aliases = Array.isArray(dto.aliases)
      ? dto.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : undefined;
    const marca = dto.marca?.trim();
    const modelo = dto.modelo?.trim();
    const data: Record<string, unknown> = {
      ...dto,
      ...(marca !== undefined ? { marca } : {}),
      ...(modelo !== undefined ? { modelo } : {}),
      ...(aliases !== undefined ? { aliases } : {}),
    };

    if (marca || modelo || aliases) {
      data.normalizado = this.normalizarModelo(marca || '', modelo || '', aliases || []);
    }

    return data;
  }

  private getLinhasImportacao(importDto: ImportCompatibilidadePeliculasDto) {
    const linhas = [
      ...(Array.isArray(importDto.linhas) ? importDto.linhas : []),
      ...String(importDto.texto || '').split(/\r?\n/g),
    ];

    return linhas
      .map((linha) => String(linha || '').trim())
      .filter(Boolean);
  }

  private parseLinhaCompatibilidade(linha: string) {
    const clean = linha.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = clean.split(/\s+-\s+|;|=>/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    return {
      base: parts[0],
      compatibilidades: parts
        .slice(1)
        .join(' / ')
        .split(/\s*\/\s*|\s*,\s*/)
        .map((part) => part.trim())
        .filter(Boolean),
    };
  }

  private parseModeloImportado(value: string, marcaFallback?: string): ModeloImportado | null {
    const alias = String(value || '').trim();
    if (!alias) {
      return null;
    }

    const marcasConhecidas = [
      'Apple',
      'Samsung',
      'Motorola',
      'Xiaomi',
      'Redmi',
      'Poco',
      'LG',
      'Asus',
      'Nokia',
      'Realme',
      'Huawei',
      'Honor',
      'Oppo',
      'Vivo',
      'Positivo',
      'Multilaser',
      'Lenovo',
    ];
    const marcaEncontrada = marcasConhecidas.find((marca) =>
      this.normalizarTexto(alias).startsWith(this.normalizarTexto(marca)),
    );
    const marca = marcaEncontrada || marcaFallback || alias.split(/\s+/)[0];
    const modelo = alias
      .replace(new RegExp(`^${this.escapeRegExp(marca)}\\s+`, 'i'), '')
      .trim() || alias;

    return { marca, modelo, alias };
  }

  private async findOrCreateModeloImportado(input: ModeloImportado, empresaId?: string) {
    const normalizadoModelo = this.normalizarTexto(input.modelo);
    const normalizadoAlias = this.normalizarTexto(input.alias);
    const existing = await this.aparelhoModeloModel
      .findOne(this.getEmpresaQuery(empresaId, {
        ativo: { $ne: false },
        $or: [
          { normalizado: { $regex: `(^|\\| )${this.escapeRegExp(normalizadoModelo)}( \\||$)` } },
          { normalizado: { $regex: `(^|\\| )${this.escapeRegExp(normalizadoAlias)}( \\||$)` } },
        ],
      }))
      .exec();

    if (!existing) {
      const modelo = await this.createModelo({
        empresaId,
        marca: input.marca,
        modelo: input.modelo,
        aliases: input.alias !== input.modelo ? [input.alias] : [],
        ativo: true,
      });
      return { modelo, created: true, updated: false };
    }

    const aliases = new Set([...(existing.aliases || [])]);
    if (input.alias && input.alias !== existing.modelo) {
      aliases.add(input.alias);
    }

    const nextAliases = Array.from(aliases);
    const shouldUpdate = nextAliases.length !== (existing.aliases || []).length;
    if (shouldUpdate) {
      existing.aliases = nextAliases;
      existing.normalizado = this.normalizarModelo(existing.marca, existing.modelo, nextAliases);
      await existing.save();
    }

    return { modelo: existing, created: false, updated: shouldUpdate };
  }

  private async findOrCreateRelacaoImportada(modeloBaseId: string, modeloCompativelId: string, empresaId?: string) {
    const existing = await this.compatibilidadeModeloModel
      .findOne(this.getEmpresaQuery(empresaId, {
        tipoProduto: 'pelicula',
        ativo: { $ne: false },
        $or: [
          { modeloBaseId, modeloCompativelId },
          { modeloBaseId: modeloCompativelId, modeloCompativelId: modeloBaseId },
        ],
      }))
      .exec();

    if (existing) {
      return { relacao: existing, created: false };
    }

    const relacao = await this.createCompatibilidadeModelo({
      empresaId,
      tipoProduto: 'pelicula',
      modeloBaseId,
      modeloCompativelId,
      observacoes: 'Importado da planilha de compatibilidade',
      ativo: true,
    });
    return { relacao, created: true };
  }

  private async getEquipamentoConsulta(params: SugestoesPeliculasParams) {
    if (params.origemTipo === 'ordem_servico' && params.origemId) {
      const ordem = await this.ordemServicoModel.findById(params.origemId).lean().exec();
      if (!ordem?.recebimentoEquipamentoId) {
        return null;
      }
      const recebimento = await this.recebimentoEquipamentoModel
        .findById(ordem.recebimentoEquipamentoId)
        .select('empresaId marca modelo imeiOuSerial tipoEquipamento')
        .lean()
        .exec();
      return recebimento
        ? {
            empresaId: recebimento.empresaId,
            marca: recebimento.marca,
            modelo: recebimento.modelo,
            imeiOuSerial: recebimento.imeiOuSerial,
            tipoEquipamento: recebimento.tipoEquipamento,
          }
        : null;
    }

    return {
      empresaId: params.empresaId,
      marca: params.marca,
      modelo: params.modelo,
    };
  }

  private async findModeloPorTexto(marca: string, modelo: string, empresaId?: string) {
    const alvo = this.normalizarTexto(`${marca} ${modelo}`);
    const alvoModelo = this.normalizarTexto(modelo);
    const modelos = await this.aparelhoModeloModel
      .find(this.getEmpresaQuery(empresaId, { ativo: { $ne: false } }))
      .lean()
      .exec();

    return modelos.find((registro) => {
      const possibilidades = [
        registro.normalizado,
        this.normalizarTexto(registro.modelo),
        ...((registro.aliases || []).map((alias) => this.normalizarTexto(alias))),
      ];
      return possibilidades.some((possibilidade) => possibilidade === alvo || possibilidade === alvoModelo);
    });
  }

  private findModeloContidoNoTexto(nomeNormalizado: string, modelos: any[]) {
    return modelos
      .map((registro) => {
        const possibilidades = [
          `${registro.marca || ''} ${registro.modelo || ''}`,
          registro.modelo,
          ...((registro.aliases || []) as string[]),
        ]
          .map((value) => this.normalizarTexto(value))
          .filter(Boolean);

        const match = possibilidades
          .filter((possibilidade) => nomeNormalizado.includes(possibilidade))
          .sort((a, b) => b.length - a.length)[0];

        return match ? { registro, matchLength: match.length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b!.matchLength - a!.matchLength)[0]?.registro;
  }

  private detectarTipoProduto(nomeNormalizado: string) {
    if (/\b(pelicula|vidro|glass|protector)\b/.test(nomeNormalizado)) {
      return 'pelicula';
    }
    if (/\b(tela|display|frontal|lcd|touch)\b/.test(nomeNormalizado)) {
      return 'tela';
    }
    if (/\b(bateria)\b/.test(nomeNormalizado)) {
      return 'bateria';
    }
    if (/\b(conector|dock|carga)\b/.test(nomeNormalizado)) {
      return 'conector';
    }
    return undefined;
  }

  private detectarQualidade(nomeNormalizado: string) {
    const qualidades: Record<string, string> = {
      premium: 'premium',
      oled: 'oled',
      tled: 'tled',
      incell: 'incell',
      'soft oled': 'softoled',
      softoled: 'softoled',
      'full hd': 'full_hd',
      fullhd: 'full_hd',
      original: 'original',
      similar: 'similar',
    };

    return Object.entries(qualidades).find(([label]) => nomeNormalizado.includes(label))?.[1];
  }

  private detectarAro(nomeNormalizado: string) {
    if (nomeNormalizado.includes('sem aro')) return 'sem_aro';
    if (nomeNormalizado.includes('com aro')) return 'com_aro';
    return undefined;
  }

  private detectarCor(nomeNormalizado: string) {
    const cores = ['preto', 'branco', 'azul', 'amarelo', 'vermelho', 'verde', 'rosa', 'dourado', 'prata', 'cinza'];
    return cores.find((cor) => nomeNormalizado.includes(cor));
  }

  private normalizarModelo(marca: string, modelo: string, aliases: string[] = []) {
    return [marca, modelo, ...aliases]
      .map((parte) => this.normalizarTexto(parte))
      .filter(Boolean)
      .join(' | ');
  }

  private normalizarTexto(value: unknown) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    if (!empresaId) {
      return base;
    }
    return this.withEmpresaScope(empresaId, base);
  }

  private withEmpresaScope(empresaId: string, base: Record<string, unknown> = {}) {
    return {
      $and: [
        base,
        { $or: [{ empresaId }, { empresaId: { $exists: false } }, { empresaId: null }] },
      ],
    };
  }
}
