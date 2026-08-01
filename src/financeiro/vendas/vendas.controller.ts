import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { VendasService } from './vendas.service';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { CreateItensVendaDto } from './dto/create-itens-venda.dto';
import { UpdateItensVendaDto } from './dto/update-itens-venda.dto';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('vendas')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  // Venda routes
  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  create(@Body() createVendaDto: CreateVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.create(createVendaDto, user?.id, user?.empresaId);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.findAll(user?.empresaId);
  }

  // ItensVenda routes
  @Post('itens')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  createItem(@Body() createItensVendaDto: CreateItensVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.createItem(createItensVendaDto, user?.empresaId);
  }

  @Get('itens')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  findAllItems(@CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.findAllItems(user?.empresaId);
  }

  @Get('itens/:id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  findOneItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.findOneItem(id, user?.empresaId);
  }

  @Patch('itens/:id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  updateItem(@Param('id') id: string, @Body() updateItensVendaDto: UpdateItensVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.updateItem(id, updateItensVendaDto, user?.empresaId);
  }

  @Delete('itens/:id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CANCELAR)
  removeItem(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.removeItem(id, user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  update(@Param('id') id: string, @Body() updateVendaDto: UpdateVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.update(id, updateVendaDto, user?.id, user?.empresaId);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CANCELAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.remove(id, user?.id, user?.empresaId);
  }
}
