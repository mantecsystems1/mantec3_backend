import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProdutosService } from './produtos.service';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';

mkdirSync('./uploads/produtos', { recursive: true });

const extensaoPorMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const produtoFotoStorage = diskStorage({
  destination: './uploads/produtos',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = extname(file.originalname) || extensaoPorMimeType[file.mimetype] || '';
    callback(null, `produto-${suffix}${extension}`);
  },
});

const produtoFotoFilter = (_req: unknown, file: { mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
  if (!file.mimetype.startsWith('image/')) {
    callback(new BadRequestException('A foto do produto deve ser uma imagem.'), false);
    return;
  }

  callback(null, true);
};

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
  create(@Body() createProdutoDto: CreateProdutoDto) {
    return this.produtosService.create(createProdutoDto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('foto', {
    storage: produtoFotoStorage,
    fileFilter: produtoFotoFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  createComFoto(@UploadedFile() file: any, @Body() body: any) {
    if (!file) {
      return this.produtosService.create(body);
    }

    return this.produtosService.create(montarDadosFotoProduto(file, body));
  }

  @Get()
  findAll() {
    return this.produtosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.produtosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProdutoDto: UpdateProdutoDto) {
    return this.produtosService.update(id, updateProdutoDto);
  }

  @Patch(':id/upload')
  @UseInterceptors(FileInterceptor('foto', {
    storage: produtoFotoStorage,
    fileFilter: produtoFotoFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  updateComFoto(@Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    if (!file) {
      return this.produtosService.update(id, body);
    }

    return this.produtosService.update(id, montarDadosFotoProduto(file, body));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.produtosService.remove(id);
  }
}
