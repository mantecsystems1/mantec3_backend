import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { CreateLogEventoDto } from './dto/create-log-evento.dto';
import { UpdateLogEventoDto } from './dto/update-log-evento.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('auditoria')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_GERENCIAR)
  create(@Body() createLogEventoDto: CreateLogEventoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.create(createLogEventoDto, user?.empresaId);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.findAll(user?.empresaId);
  }

  @Get('entidade/:entidade/:entidadeId')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findByEntidade(@Param('entidade') entidade: string, @Param('entidadeId') entidadeId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.findByEntidade(entidade, entidadeId, user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_GERENCIAR)
  update(@Param('id') id: string, @Body() updateLogEventoDto: UpdateLogEventoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.update(id, updateLogEventoDto, user?.empresaId);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_GERENCIAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.auditoriaService.remove(id, user?.empresaId);
  }
}
