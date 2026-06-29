import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MidiasRecebimentoService } from './midias-recebimento.service';
import { CreateMidiasRecebimentoDto } from './dto/create-midias-recebimento.dto';
import { UpdateMidiasRecebimentoDto } from './dto/update-midias-recebimento.dto';

mkdirSync('./uploads/recebimentos', { recursive: true });

const storage = diskStorage({
  destination: './uploads/recebimentos',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `midia-${suffix}${extname(file.originalname)}`);
  },
});

@Controller('midias-recebimento')
export class MidiasRecebimentoController {
  constructor(private readonly midiasRecebimentoService: MidiasRecebimentoService) {}

  @Post()
  create(@Body() createMidiasRecebimentoDto: CreateMidiasRecebimentoDto) {
    return this.midiasRecebimentoService.create(createMidiasRecebimentoDto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('arquivo', { storage }))
  upload(@UploadedFile() file: any, @Body() body: Omit<CreateMidiasRecebimentoDto, 'urlArquivo'>) {
    return this.midiasRecebimentoService.create({
      recebimentoEquipamentoId: body.recebimentoEquipamentoId,
      tipo: body.tipo,
      descricao: body.descricao,
      urlArquivo: `/uploads/recebimentos/${file.filename}`,
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
