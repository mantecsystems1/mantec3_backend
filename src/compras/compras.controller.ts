import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { CreatePedidoCompraDto } from './dto/create-pedido-compra.dto';
import { UpdatePedidoCompraDto } from './dto/update-pedido-compra.dto';
import { CreateItensPedidoCompraDto } from './dto/create-itens-pedido-compra.dto';
import { UpdateItensPedidoCompraDto } from './dto/update-itens-pedido-compra.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('compras')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  // Fornecedor routes
  @Post('fornecedores')
  @RequireEvento(EVENTOS_NEGOCIO.FORNECEDOR_GERENCIAR)
  createFornecedor(@Body() createFornecedorDto: CreateFornecedorDto, @CurrentUser() user?: CurrentUserPayload) {
    console.log('Request body /compras/fornecedores:', createFornecedorDto);
    try {
      return this.comprasService.createFornecedor(createFornecedorDto, user?.id, user?.empresaId);
    } catch (err) {
      console.error('Erro no controller createFornecedor:', err);
      throw err;
    }
  }

  @Get('fornecedores')
  @RequireEvento(EVENTOS_NEGOCIO.FORNECEDOR_CONSULTAR)
  findAllFornecedores(@CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findAllFornecedores(user?.empresaId);
  }

  @Get('fornecedores/:id')
  @RequireEvento(EVENTOS_NEGOCIO.FORNECEDOR_CONSULTAR)
  findOneFornecedor(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findOneFornecedor(id, user?.empresaId);
  }

  @Patch('fornecedores/:id')
  @RequireEvento(EVENTOS_NEGOCIO.FORNECEDOR_GERENCIAR)
  updateFornecedor(@Param('id') id: string, @Body() updateFornecedorDto: UpdateFornecedorDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.updateFornecedor(id, updateFornecedorDto, user?.id, user?.empresaId);
  }

  @Delete('fornecedores/:id')
  @RequireEvento(EVENTOS_NEGOCIO.FORNECEDOR_GERENCIAR)
  removeFornecedor(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.removeFornecedor(id, user?.id, user?.empresaId);
  }

  // PedidosCompra routes
  @Post('pedidos-compra')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  createPedidoCompra(@Body() createPedidoCompraDto: CreatePedidoCompraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.createPedidoCompra(createPedidoCompraDto, user?.id, user?.empresaId);
  }

  @Get('pedidos-compra')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)
  findAllPedidosCompra(@CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findAllPedidosCompra(user?.empresaId);
  }

  @Get('pedidos-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)
  findOnePedidoCompra(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findOnePedidoCompra(id, user?.empresaId);
  }

  @Patch('pedidos-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  updatePedidoCompra(@Param('id') id: string, @Body() updatePedidoCompraDto: UpdatePedidoCompraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.updatePedidoCompra(id, updatePedidoCompraDto, user?.id, user?.empresaId);
  }

  @Delete('pedidos-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  removePedidoCompra(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.removePedidoCompra(id, user?.id, user?.empresaId);
  }

  // ItensPedidoCompra routes
  @Post('itens-pedido-compra')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  createItensPedidoCompra(@Body() createItensPedidoCompraDto: CreateItensPedidoCompraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.createItensPedidoCompra(createItensPedidoCompraDto, user?.id, user?.empresaId);
  }

  @Get('itens-pedido-compra')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)
  findAllItensPedidoCompra(@CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findAllItensPedidoCompra(user?.empresaId);
  }

  @Get('itens-pedido-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)
  findOneItensPedidoCompra(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.findOneItensPedidoCompra(id, user?.empresaId);
  }

  @Patch('itens-pedido-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  updateItensPedidoCompra(@Param('id') id: string, @Body() updateItensPedidoCompraDto: UpdateItensPedidoCompraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.updateItensPedidoCompra(id, updateItensPedidoCompraDto, user?.id, user?.empresaId);
  }

  @Delete('itens-pedido-compra/:id')
  @RequireEvento(EVENTOS_NEGOCIO.COMPRA_PEDIDO_GERENCIAR)
  removeItensPedidoCompra(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.comprasService.removeItensPedidoCompra(id, user?.id, user?.empresaId);
  }
}
