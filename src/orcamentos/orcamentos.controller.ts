import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { CreateOrcamentoCompletoDto } from './dto/create-orcamento-completo.dto';
import { UpdateOrcamentoCompletoDto } from './dto/update-orcamento-completo.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento, RequireEventoFromBody } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { ORCAMENTO_STATUS } from './state/orcamento.states';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentosService: OrcamentosService) {}

  @Post('completo')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CRIAR)
  createCompleto(@Body() dto: CreateOrcamentoCompletoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.createCompleto(dto, user);
  }

  @Get('completo/operacoes/:operacaoId')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  porOperacao(@Param('operacaoId') operacaoId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.porOperacao(operacaoId, user);
  }

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CRIAR)
  create(@Body() createOrcamentoDto: CreateOrcamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.create(createOrcamentoDto, user);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findAll(user?.empresaId);
  }

  @Get('paginado')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findAllPaginado(@Query() query: Record<string, unknown>, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findAllPaginado(user?.empresaId, query);
  }

  @Post('itens')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  createItem(@Body() createItensOrcamentoDto: CreateItensOrcamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.createItem(createItensOrcamentoDto, user?.empresaId);
  }

  @Get('itens')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findAllItems(@CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findAllItems(user?.empresaId);
  }

  @Get('itens/:id')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findOneItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findOneItem(id, user?.empresaId);
  }

  @Patch('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  updateItem(@Param('id') id: string, @Body() updateItensOrcamentoDto: UpdateItensOrcamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.updateItem(id, updateItensOrcamentoDto, user?.empresaId);
  }

  @Delete('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  removeItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.removeItem(id, user?.empresaId);
  }

  @Get(':id/itens')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findItemsByOrcamento(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findItemsByOrcamento(id, user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.findOne(id, user?.empresaId);
  }

  @Post(':id/enviar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_ENVIAR)
  enviar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.ENVIADO }, user?.empresaId, user);
  }

  @Post(':id/aprovar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_APROVAR)
  aprovar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.APROVADO }, user?.empresaId, user);
  }

  @Post(':id/reprovar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_REPROVAR)
  reprovar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.REPROVADO }, user?.empresaId, user);
  }

  @Post(':id/cancelar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CANCELAR)
  cancelar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.CANCELADO }, user?.empresaId, user);
  }

  @Post(':id/gerar-os')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.OS_CRIAR)
  gerarOrdemServico(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.gerarOrdemServico(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEventoFromBody('status', {
    enviado: EVENTOS_NEGOCIO.ORCAMENTO_ENVIAR,
    aprovado: EVENTOS_NEGOCIO.ORCAMENTO_APROVAR,
    rejeitado: EVENTOS_NEGOCIO.ORCAMENTO_REPROVAR,
    reprovado: EVENTOS_NEGOCIO.ORCAMENTO_REPROVAR,
    cancelado: EVENTOS_NEGOCIO.ORCAMENTO_CANCELAR,
  }, EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  update(@Param('id') id: string, @Body() updateOrcamentoDto: UpdateOrcamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.update(id, updateOrcamentoDto, user?.empresaId, user);
  }

  @Patch(':id/completo')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  updateCompleto(@Param('id') id: string, @Body() dto: UpdateOrcamentoCompletoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.updateCompleto(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CANCELAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.orcamentosService.remove(id, user?.empresaId, user);
  }
}
