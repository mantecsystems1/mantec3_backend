import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProdutosService } from './produtos.service';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { fileFilterSeguro } from '../../common/uploads/upload-security';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { acceptUpload } from '../../common/uploads/upload-content';

mkdirSync('./uploads/produtos', { recursive: true });

const extensaoPorMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const PRODUTO_FOTO_MIME_TYPES = new Set(Object.keys(extensaoPorMimeType));

const produtoFotoStorage = diskStorage({
  destination: './uploads/produtos',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = extname(file.originalname) || extensaoPorMimeType[file.mimetype] || '';
    callback(null, `produto-${suffix}${extension}`);
  },
});

const produtoFotoFilter = fileFilterSeguro(PRODUTO_FOTO_MIME_TYPES, 'A foto do produto');

const montarDadosFotoProduto = (file: any, body: any) => {
  const fotoHashSha256 = createHash('sha256').update(readFileSync(file.path)).digest('hex');

  return {
    ...body,
    fotoUrl: `/uploads/produtos/${file.filename}`,
    fotoNomeOriginal: file.originalname,
    fotoNomeArquivo: file.filename,
    fotoMimeType: file.mimetype,
    fotoTamanhoBytes: file.size,
    fotoHashSha256,
    fotoOrigemCaptura: body.fotoOrigemCaptura ?? 'arquivo',
    fotoCapturadaEm: body.fotoCapturadaEm ?? new Date().toISOString(),
  };
};

@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_GERENCIAR)
  create(@Body() createProdutoDto: CreateProdutoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.produtosService.create(createProdutoDto, user?.empresaId);
  }

  @Post('upload')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_GERENCIAR)
  @UseInterceptors(FileInterceptor('foto', {
    storage: produtoFotoStorage,
    fileFilter: produtoFotoFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  async createComFoto(@UploadedFile() file: any, @Body() body: any, @CurrentUser() user?: CurrentUserPayload) {
    if (!file) {
      return this.produtosService.create(body, user?.empresaId);
    }

    return acceptUpload('produtos', file, () => this.produtosService.create(montarDadosFotoProduto(file, body), user?.empresaId));
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.produtosService.findAll(user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.produtosService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_GERENCIAR)
  update(@Param('id') id: string, @Body() updateProdutoDto: UpdateProdutoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.produtosService.update(id, updateProdutoDto, user?.empresaId);
  }

  @Patch(':id/upload')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_GERENCIAR)
  @UseInterceptors(FileInterceptor('foto', {
    storage: produtoFotoStorage,
    fileFilter: produtoFotoFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  async updateComFoto(@Param('id') id: string, @UploadedFile() file: any, @Body() body: any, @CurrentUser() user?: CurrentUserPayload) {
    if (!file) {
      return this.produtosService.update(id, body, user?.empresaId);
    }

    return acceptUpload('produtos', file, () => this.produtosService.update(id, montarDadosFotoProduto(file, body), user?.empresaId));
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_GERENCIAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.produtosService.remove(id, user?.empresaId);
  }
}
