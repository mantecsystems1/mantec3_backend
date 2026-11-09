import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, UsePipes, ValidationPipe, Query } from '@nestjs/common';
import { OsService } from './os.service';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { RegistrarEntregaOsDto } from './dto/registrar-entrega-os.dto';
import { RegistrarChecklistQualidadeOsDto } from './dto/registrar-checklist-qualidade.dto';
import { RegistrarCorrecaoChecklistQualidadeDto } from './dto/registrar-correcao-checklist-qualidade.dto';
import { CreateItensUtilizadosOSDto } from './dto/create-itens-utilizados-os.dto';
import { UpdateItensUtilizadosOSDto } from './dto/update-itens-utilizados-os.dto';
import { CreatePecaReservadaOSDto } from './dto/create-peca-reservada-os.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento, RequireEventoFromBody } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { OS_STATUS } from './state/os.states';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('ordens-servico')
export class OsController {
  constructor(private readonly osService: OsService) {}

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CRIAR)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Body() createOrdemServicoDto: CreateOrdemServicoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.create(createOrdemServicoDto, user?.empresaId, user);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findAll(user?.empresaId);
  }

  @Get('paginado')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findAllPaginado(@Query() query: Record<string, unknown>, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findAllPaginado(user?.empresaId, query);
  }

  @Post('itens-utilizados')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  createItem(@Body() createItensUtilizadosOSDto: CreateItensUtilizadosOSDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.createItem(createItensUtilizadosOSDto, {}, user?.empresaId, user);
  }

  @Get('itens-utilizados')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findAllItems(@CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findAllItems(user?.empresaId);
  }

  @Get('itens-utilizados/os/:ordemServicoId')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findItemsByOs(@Param('ordemServicoId') ordemServicoId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findItemsByOs(ordemServicoId, user?.empresaId);
  }

  @Get('itens-utilizados/:id')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findOneItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findOneItem(id, user?.empresaId);
  }

  @Post('reservas-pecas')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_RESERVAR_PECA)
  createReserva(@Body() createPecaReservadaOSDto: CreatePecaReservadaOSDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.reservarPeca(createPecaReservadaOSDto, user?.empresaId, user);
  }

  @Get('reservas-pecas')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findReservasPendentes(@CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findReservasPendentes(user?.empresaId);
  }

  @Get('reservas-pecas/os/:ordemServicoId')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findReservasByOs(@Param('ordemServicoId') ordemServicoId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findReservasByOs(ordemServicoId, user?.empresaId);
  }

  @Post('reservas-pecas/:id/consumir')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  consumirReserva(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.consumirReserva(id, user?.empresaId, user);
  }

  @Delete('reservas-pecas/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_RESERVAR_PECA)
  removeReserva(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.removerReserva(id, user?.empresaId, user);
  }

  @Patch('itens-utilizados/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  updateItem(@Param('id') id: string, @Body() updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.updateItem(id, updateItensUtilizadosOSDto, user?.empresaId, user);
  }

  @Delete('itens-utilizados/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  removeItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.removeItem(id, user?.empresaId, user);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.findOne(id, user?.empresaId);
  }

  @Post(':id/iniciar-diagnostico')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_INICIAR_DIAGNOSTICO)
  iniciarDiagnostico(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.EM_DIAGNOSTICO }, user?.empresaId, user);
  }

  @Post(':id/aguardar-peca')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_AGUARDAR_PECA)
  aguardarPeca(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.AGUARDANDO_PECA }, user?.empresaId, user);
  }

  @Post(':id/iniciar-execucao')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_INICIAR_EXECUCAO)
  iniciarExecucao(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.EM_EXECUCAO }, user?.empresaId, user);
  }

  @Post(':id/finalizar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_FINALIZAR)
  finalizar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.CONCLUIDA }, user?.empresaId, user);
  }

  @Patch(':id/checklist-qualidade')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_FINALIZAR)
  salvarChecklistQualidade(
    @Param('id') id: string,
    @Body() dto: RegistrarChecklistQualidadeOsDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.osService.salvarChecklistQualidade(id, dto, user);
  }

  @Post(':id/checklist-qualidade/correcoes')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CORRIGIR_CHECKLIST_QUALIDADE)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  corrigirChecklistQualidade(
    @Param('id') id: string,
    @Body() dto: RegistrarCorrecaoChecklistQualidadeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.osService.corrigirChecklistQualidade(id, dto, user);
  }

  @Post(':id/entrega-assinatura')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_FINALIZAR)
  registrarEntrega(
    @Param('id') id: string,
    @Body() dto: RegistrarEntregaOsDto,
    @Req() req: any,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.osService.registrarEntrega(id, {
      ...dto,
      ipAssinaturaEntrega: this.getClientIp(req),
      userAgentAssinaturaEntrega: req?.headers?.['user-agent'],
    }, user);
  }

  @Post(':id/cancelar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CANCELAR)
  cancelar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.CANCELADA }, user?.empresaId, user);
  }

  @Patch(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEventoFromBody('statusOperacional', {
    em_diagnostico: EVENTOS_NEGOCIO.OS_INICIAR_DIAGNOSTICO,
    aguardando_peca: EVENTOS_NEGOCIO.OS_AGUARDAR_PECA,
    em_execucao: EVENTOS_NEGOCIO.OS_INICIAR_EXECUCAO,
    concluida: EVENTOS_NEGOCIO.OS_FINALIZAR,
    cancelada: EVENTOS_NEGOCIO.OS_CANCELAR,
  }, EVENTOS_NEGOCIO.OS_INICIAR_EXECUCAO)
  update(@Param('id') id: string, @Body() updateOrdemServicoDto: UpdateOrdemServicoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.update(id, updateOrdemServicoDto, user?.empresaId, user);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CANCELAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.osService.remove(id, user?.empresaId, user);
  }

  private getClientIp(req: any) {
    return req?.ip || req?.socket?.remoteAddress;
  }
}
