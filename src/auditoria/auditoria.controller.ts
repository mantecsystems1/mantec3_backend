import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { CreateLogEventoDto } from './dto/create-log-evento.dto';
import { UpdateLogEventoDto } from './dto/update-log-evento.dto';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Post()
  create(@Body() createLogEventoDto: CreateLogEventoDto) {
    return this.auditoriaService.create(createLogEventoDto);
  }

  @Get()
  findAll() {
    return this.auditoriaService.findAll();
  }

  @Get('entidade/:entidade/:entidadeId')
  findByEntidade(@Param('entidade') entidade: string, @Param('entidadeId') entidadeId: string) {
    return this.auditoriaService.findByEntidade(entidade, entidadeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditoriaService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLogEventoDto: UpdateLogEventoDto) {
    return this.auditoriaService.update(id, updateLogEventoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.auditoriaService.remove(id);
  }
}
