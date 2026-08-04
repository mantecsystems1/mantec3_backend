import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { NotificacaoService } from './notificacao.service';
import { CreateNotificacaoDto } from './dto/create-notificacao.dto';
import { UpdateNotificacaoDto } from './dto/update-notificacao.dto';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';

@Controller('notificacao')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class NotificacaoController {
  constructor(private readonly notificacaoService: NotificacaoService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.NOTIFICACAO_ENVIAR)
  create(@Body() createNotificacaoDto: CreateNotificacaoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.notificacaoService.create(createNotificacaoDto, user);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.notificacaoService.findAll(user?.empresaId);
  }

  @Get('cliente/:clienteId')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findByCliente(@Param('clienteId') clienteId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.notificacaoService.findByCliente(clienteId, user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.notificacaoService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTIFICACAO_ENVIAR)
  update(
    @Param('id') id: string,
    @Body() updateNotificacaoDto: UpdateNotificacaoDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.notificacaoService.update(id, updateNotificacaoDto, user);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTIFICACAO_ENVIAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.notificacaoService.remove(id, user?.empresaId);
  }
}
