import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MidiasRecebimentoService } from './midias-recebimento.service';
import { CreateMidiasRecebimentoDto } from './dto/create-midias-recebimento.dto';
import { UpdateMidiasRecebimentoDto } from './dto/update-midias-recebimento.dto';

mkdirSync('./uploads/recebimentos', { recursive: true });

const extensaoPorMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

const storage = diskStorage({
  destination: './uploads/recebimentos',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = extname(file.originalname) || extensaoPorMimeType[file.mimetype] || '';
    callback(null, `midia-${suffix}${extension}`);
  },
});

const fileFilter = (_req: unknown, file: { mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
  const isMedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  if (!isMedia) {
    callback(new BadRequestException('A midia do recebimento deve ser uma imagem ou video.'), false);
    return;
  }

  callback(null, true);
};

@Controller('midias-recebimento')
export class MidiasRecebimentoController {
  constructor(private readonly midiasRecebimentoService: MidiasRecebimentoService) {}

  @Post()
  create(@Body() createMidiasRecebimentoDto: CreateMidiasRecebimentoDto) {
    return this.midiasRecebimentoService.create(createMidiasRecebimentoDto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('arquivo', {
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  upload(@UploadedFile() file: any, @Body() body: Omit<CreateMidiasRecebimentoDto, 'urlArquivo'>) {
    if (!file) {
      throw new BadRequestException('Arquivo da midia e obrigatorio.');
    }

    const hashSha256 = createHash('sha256').update(readFileSync(file.path)).digest('hex');

    return this.midiasRecebimentoService.create({
      recebimentoEquipamentoId: body.recebimentoEquipamentoId,
      tipo: body.tipo,
      descricao: body.descricao,
      urlArquivo: `/uploads/recebimentos/${file.filename}`,
      nomeOriginal: file.originalname,
      nomeArquivo: file.filename,
      mimeType: file.mimetype,
      tamanhoBytes: file.size,
      hashSha256,
      origemCaptura: body.origemCaptura ?? 'arquivo',
      capturadoEm: body.capturadoEm ?? new Date().toISOString(),
    });
  }

  @Get()
  findAll() {
    return this.midiasRecebimentoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.midiasRecebimentoService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMidiasRecebimentoDto: UpdateMidiasRecebimentoDto) {
    return this.midiasRecebimentoService.update(id, updateMidiasRecebimentoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.midiasRecebimentoService.remove(id);
  }
}
