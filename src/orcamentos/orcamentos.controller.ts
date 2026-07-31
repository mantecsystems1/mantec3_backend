import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento, RequireEventoFromBody } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { ORCAMENTO_STATUS } from './state/orcamento.states';

@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentosService: OrcamentosService) {}

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CRIAR)
  create(@Body() createOrcamentoDto: CreateOrcamentoDto) {
    return this.orcamentosService.create(createOrcamentoDto);
  }

  @Get()
  findAll() {
    return this.orcamentosService.findAll();
  }

  @Post('itens')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  createItem(@Body() createItensOrcamentoDto: CreateItensOrcamentoDto) {
    return this.orcamentosService.createItem(createItensOrcamentoDto);
  }

  @Get('itens')
  findAllItems() {
    return this.orcamentosService.findAllItems();
  }

  @Get('itens/:id')
  findOneItem(@Param('id') id: string) {
    return this.orcamentosService.findOneItem(id);
  }

  @Patch('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  updateItem(@Param('id') id: string, @Body() updateItensOrcamentoDto: UpdateItensOrcamentoDto) {
    return this.orcamentosService.updateItem(id, updateItensOrcamentoDto);
  }

  @Delete('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO)
  removeItem(@Param('id') id: string) {
    return this.orcamentosService.removeItem(id);
  }

  @Get(':id/itens')
  findItemsByOrcamento(@Param('id') id: string) {
    return this.orcamentosService.findItemsByOrcamento(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orcamentosService.findOne(id);
  }

  @Post(':id/enviar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_ENVIAR)
  enviar(@Param('id') id: string) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.ENVIADO });
  }

  @Post(':id/aprovar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_APROVAR)
  aprovar(@Param('id') id: string) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.APROVADO });
  }

  @Post(':id/reprovar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_REPROVAR)
  reprovar(@Param('id') id: string) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.REPROVADO });
  }

  @Post(':id/cancelar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CANCELAR)
  cancelar(@Param('id') id: string) {
    return this.orcamentosService.update(id, { status: ORCAMENTO_STATUS.CANCELADO });
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
  update(@Param('id') id: string, @Body() updateOrcamentoDto: UpdateOrcamentoDto) {
    return this.orcamentosService.update(id, updateOrcamentoDto);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CANCELAR)
  remove(@Param('id') id: string) {
    return this.orcamentosService.remove(id);
  }
}
