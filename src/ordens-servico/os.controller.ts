import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OsService } from './os.service';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { CreateItensUtilizadosOSDto } from './dto/create-itens-utilizados-os.dto';
import { UpdateItensUtilizadosOSDto } from './dto/update-itens-utilizados-os.dto';
import { CreatePecaReservadaOSDto } from './dto/create-peca-reservada-os.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento, RequireEventoFromBody } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { OS_STATUS } from './state/os.states';

@Controller('ordens-servico')
export class OsController {
  constructor(private readonly osService: OsService) {}

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CRIAR)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Body() createOrdemServicoDto: CreateOrdemServicoDto) {
    return this.osService.create(createOrdemServicoDto);
  }

  @Get()
  findAll() {
    return this.osService.findAll();
  }

  @Post('itens-utilizados')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  createItem(@Body() createItensUtilizadosOSDto: CreateItensUtilizadosOSDto) {
    return this.osService.createItem(createItensUtilizadosOSDto);
  }

  @Get('itens-utilizados')
  findAllItems() {
    return this.osService.findAllItems();
  }

  @Get('itens-utilizados/os/:ordemServicoId')
  findItemsByOs(@Param('ordemServicoId') ordemServicoId: string) {
    return this.osService.findItemsByOs(ordemServicoId);
  }

  @Get('itens-utilizados/:id')
  findOneItem(@Param('id') id: string) {
    return this.osService.findOneItem(id);
  }

  @Post('reservas-pecas')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_RESERVAR_PECA)
  createReserva(@Body() createPecaReservadaOSDto: CreatePecaReservadaOSDto) {
    return this.osService.reservarPeca(createPecaReservadaOSDto);
  }

  @Get('reservas-pecas')
  findReservasPendentes() {
    return this.osService.findReservasPendentes();
  }

  @Get('reservas-pecas/os/:ordemServicoId')
  findReservasByOs(@Param('ordemServicoId') ordemServicoId: string) {
    return this.osService.findReservasByOs(ordemServicoId);
  }

  @Post('reservas-pecas/:id/consumir')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  consumirReserva(@Param('id') id: string) {
    return this.osService.consumirReserva(id);
  }

  @Delete('reservas-pecas/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_RESERVAR_PECA)
  removeReserva(@Param('id') id: string) {
    return this.osService.removerReserva(id);
  }

  @Patch('itens-utilizados/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  updateItem(@Param('id') id: string, @Body() updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto) {
    return this.osService.updateItem(id, updateItensUtilizadosOSDto);
  }

  @Delete('itens-utilizados/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)
  removeItem(@Param('id') id: string) {
    return this.osService.removeItem(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.osService.findOne(id);
  }

  @Post(':id/iniciar-diagnostico')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_INICIAR_DIAGNOSTICO)
  iniciarDiagnostico(@Param('id') id: string) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.EM_DIAGNOSTICO });
  }

  @Post(':id/aguardar-peca')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_AGUARDAR_PECA)
  aguardarPeca(@Param('id') id: string) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.AGUARDANDO_PECA });
  }

  @Post(':id/iniciar-execucao')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_INICIAR_EXECUCAO)
  iniciarExecucao(@Param('id') id: string) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.EM_EXECUCAO });
  }

  @Post(':id/finalizar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_FINALIZAR)
  finalizar(@Param('id') id: string) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.CONCLUIDA });
  }

  @Post(':id/cancelar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CANCELAR)
  cancelar(@Param('id') id: string) {
    return this.osService.update(id, { statusOperacional: OS_STATUS.CANCELADA });
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
  update(@Param('id') id: string, @Body() updateOrdemServicoDto: UpdateOrdemServicoDto) {
    return this.osService.update(id, updateOrdemServicoDto);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CANCELAR)
  remove(@Param('id') id: string) {
    return this.osService.remove(id);
  }
}
