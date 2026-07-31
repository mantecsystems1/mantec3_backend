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
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  // Venda routes
  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  create(@Body() createVendaDto: CreateVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.create(createVendaDto, user?.id);
  }

  @Get()
  findAll() {
    return this.vendasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendasService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  update(@Param('id') id: string, @Body() updateVendaDto: UpdateVendaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.update(id, updateVendaDto, user?.id);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CANCELAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.vendasService.remove(id, user?.id);
  }

  // ItensVenda routes
  @Post('itens')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  createItem(@Body() createItensVendaDto: CreateItensVendaDto) {
    return this.vendasService.createItem(createItensVendaDto);
  }

  @Get('itens')
  findAllItems() {
    return this.vendasService.findAllItems();
  }

  @Get('itens/:id')
  findOneItem(@Param('id') id: string) {
    return this.vendasService.findOneItem(id);
  }

  @Patch('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_GERAR)
  updateItem(@Param('id') id: string, @Body() updateItensVendaDto: UpdateItensVendaDto) {
    return this.vendasService.updateItem(id, updateItensVendaDto);
  }

  @Delete('itens/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CANCELAR)
  removeItem(@Param('id') id: string) {
    return this.vendasService.removeItem(id);
  }
}
