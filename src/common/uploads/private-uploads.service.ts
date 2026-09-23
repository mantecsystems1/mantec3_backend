import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Readable } from 'node:stream';
import { Produto, ProdutoDocument } from '../../catalogo/produtos/schemas/produto.schema';
import { AnexoFinanceiro, AnexoFinanceiroDocument } from '../../financeiro/financeiro-adm/schemas/anexo-financeiro.schema';
import { MidiasRecebimento, MidiasRecebimentoDocument } from '../../recebimento/midias/midias-recebimento.schema';
import { RecebimentoEquipamento, RecebimentoEquipamentoDocument } from '../../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { isMissingUpload, openUpload, uploadKey } from './upload-storage';

export type UploadArea = 'produtos' | 'recebimentos' | 'financeiro-provas';

export type PrivateUploadFile = {
  stream: Readable;
  contentType: string;
  filename: string;
  disposition: 'inline' | 'attachment';
};

@Injectable()
export class PrivateUploadsService {
  constructor(
    @InjectModel(Produto.name) private readonly produtoModel: Model<ProdutoDocument>,
    @InjectModel(MidiasRecebimento.name) private readonly midiaModel: Model<MidiasRecebimentoDocument>,
    @InjectModel(RecebimentoEquipamento.name) private readonly recebimentoModel: Model<RecebimentoEquipamentoDocument>,
    @InjectModel(AnexoFinanceiro.name) private readonly anexoModel: Model<AnexoFinanceiroDocument>,
  ) {}

  async getFile(area: UploadArea, filename: string, empresaId?: string): Promise<PrivateUploadFile> {
    this.assertEmpresaInformada(empresaId);
    this.assertFilenameSeguro(filename);

    const metadata = await this.getMetadata(area, filename, empresaId);

    let stream: Readable;
    try {
      stream = await openUpload(area, filename);
    } catch (error) {
      if (!isMissingUpload(error)) {
        throw error;
      }
      throw new NotFoundException('Arquivo nao encontrado.');
    }

    return {
      stream,
      contentType: metadata.contentType,
      filename: metadata.originalName || filename,
      disposition: metadata.disposition,
    };
  }

  private async getMetadata(area: UploadArea, filename: string, empresaId: string) {
    if (area === 'produtos') {
      const produto = await this.produtoModel
        .findOne({
          empresaId,
          $or: [
            { fotoNomeArquivo: filename },
            { fotoUrl: `/uploads/produtos/${filename}` },
          ],
        })
        .select('fotoMimeType fotoNomeOriginal')
        .lean()
        .exec();

      if (!produto) {
        throw new NotFoundException('Arquivo nao encontrado.');
      }

      return {
        contentType: produto.fotoMimeType || 'application/octet-stream',
        originalName: produto.fotoNomeOriginal,
        disposition: 'inline' as const,
      };
    }

    if (area === 'recebimentos') {
      const midia = await this.midiaModel
        .findOne({
          $or: [
            { nomeArquivo: filename },
            { urlArquivo: `/uploads/recebimentos/${filename}` },
          ],
        })
        .select('recebimentoEquipamentoId mimeType nomeOriginal')
        .lean()
        .exec();

      if (!midia) {
        throw new NotFoundException('Arquivo nao encontrado.');
      }

      const recebimento = await this.recebimentoModel
        .findOne({ _id: midia.recebimentoEquipamentoId, empresaId })
        .select('_id')
        .lean()
        .exec();

      if (!recebimento) {
        throw new NotFoundException('Arquivo nao encontrado.');
      }

      return {
        contentType: midia.mimeType || 'application/octet-stream',
        originalName: midia.nomeOriginal,
        disposition: 'inline' as const,
      };
    }

    const anexo = await this.anexoModel
      .findOne({
        empresaId,
        ativo: true,
        $or: [
          { nomeArquivo: filename },
          { urlArquivo: `/uploads/financeiro-provas/${filename}` },
        ],
      })
      .select('mimeType nomeOriginal')
      .lean()
      .exec();

    if (!anexo) {
      throw new NotFoundException('Arquivo nao encontrado.');
    }

    return {
      contentType: anexo.mimeType || 'application/octet-stream',
      originalName: anexo.nomeOriginal,
      disposition: 'attachment' as const,
    };
  }

  private assertFilenameSeguro(filename: string) {
    try {
      uploadKey('produtos', filename);
    } catch {
      throw new BadRequestException('Nome de arquivo invalido.');
    }
  }

  private assertEmpresaInformada(empresaId?: string): asserts empresaId is string {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
