import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MidiasRecebimentoService } from './midias-recebimento.service';
import { CreateMidiasRecebimentoDto } from './dto/create-midias-recebimento.dto';
import { UpdateMidiasRecebimentoDto } from './dto/update-midias-recebimento.dto';
import { fileFilterSeguro } from '../../common/uploads/upload-security';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { acceptUpload } from '../../common/uploads/upload-content';

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

const MIDIA_RECEBIMENTO_MIME_TYPES = new Set(Object.keys(extensaoPorMimeType));

const storage = diskStorage({
  destination: './uploads/recebimentos',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = extname(file.originalname) || extensaoPorMimeType[file.mimetype] || '';
    callback(null, `midia-${suffix}${extension}`);
  },
});

const fileFilter = fileFilterSeguro(MIDIA_RECEBIMENTO_MIME_TYPES, 'A midia do recebimento');

@Controller('midias-recebimento')
export class MidiasRecebimentoController {
  constructor(private readonly midiasRecebimentoService: MidiasRecebimentoService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  create(@Body() createMidiasRecebimentoDto: CreateMidiasRecebimentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.midiasRecebimentoService.create(createMidiasRecebimentoDto, user?.empresaId);
  }

  @Post('upload')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  @UseInterceptors(FileInterceptor('arquivo', {
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async upload(
    @UploadedFile() file: any,
    @Body() body: Omit<CreateMidiasRecebimentoDto, 'urlArquivo'>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo da midia e obrigatorio.');
    }

    return acceptUpload('recebimentos', file, () => {
      const hashSha256 = createHash('sha256').update(readFileSync(file.path)).digest('hex');

      return this.midiasRecebimentoService.create(
        {
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
        },
        user?.empresaId,
      );
    });
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.midiasRecebimentoService.findAll(user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.midiasRecebimentoService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  update(@Param('id') id: string, @Body() updateMidiasRecebimentoDto: UpdateMidiasRecebimentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.midiasRecebimentoService.update(id, updateMidiasRecebimentoDto, user?.empresaId);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_REMOVER)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.midiasRecebimentoService.remove(id, user?.empresaId);
  }
}
