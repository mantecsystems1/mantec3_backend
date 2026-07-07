import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { CreatePedidoCompraDto } from './dto/create-pedido-compra.dto';
import { UpdatePedidoCompraDto } from './dto/update-pedido-compra.dto';
import { CreateItensPedidoCompraDto } from './dto/create-itens-pedido-compra.dto';
import { UpdateItensPedidoCompraDto } from './dto/update-itens-pedido-compra.dto';

@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  // Fornecedor routes
  @Post('fornecedores')
  createFornecedor(@Body() createFornecedorDto: CreateFornecedorDto) {
    console.log('Request body /compras/fornecedores:', createFornecedorDto);
    try {
      return this.comprasService.createFornecedor(createFornecedorDto);
    } catch (err) {
      console.error('Erro no controller createFornecedor:', err);
      throw err;
    }
  }

  @Get('fornecedores')
  findAllFornecedores() {
    return this.comprasService.findAllFornecedores();
  }

  @Get('fornecedores/:id')
  findOneFornecedor(@Param('id') id: string) {
    return this.comprasService.findOneFornecedor(id);
  }

  @Patch('fornecedores/:id')
  updateFornecedor(@Param('id') id: string, @Body() updateFornecedorDto: UpdateFornecedorDto) {
    return this.comprasService.updateFornecedor(id, updateFornecedorDto);
  }

  @Delete('fornecedores/:id')
  removeFornecedor(@Param('id') id: string) {
    return this.comprasService.removeFornecedor(id);
  }

  // PedidosCompra routes
  @Post('pedidos-compra')
  createPedidoCompra(@Body() createPedidoCompraDto: CreatePedidoCompraDto) {
    return this.comprasService.createPedidoCompra(createPedidoCompraDto);
  }

  @Get('pedidos-compra')
  findAllPedidosCompra() {
    return this.comprasService.findAllPedidosCompra();
  }

  @Get('pedidos-compra/:id')
  findOnePedidoCompra(@Param('id') id: string) {
    return this.comprasService.findOnePedidoCompra(id);
  }

  @Patch('pedidos-compra/:id')
  updatePedidoCompra(@Param('id') id: string, @Body() updatePedidoCompraDto: UpdatePedidoCompraDto) {
    return this.comprasService.updatePedidoCompra(id, updatePedidoCompraDto);
  }

  @Delete('pedidos-compra/:id')
  removePedidoCompra(@Param('id') id: string) {
    return this.comprasService.removePedidoCompra(id);
  }

  // ItensPedidoCompra routes
  @Post('itens-pedido-compra')
  createItensPedidoCompra(@Body() createItensPedidoCompraDto: CreateItensPedidoCompraDto) {
    return this.comprasService.createItensPedidoCompra(createItensPedidoCompraDto);
  }

  @Get('itens-pedido-compra')
  findAllItensPedidoCompra() {
    return this.comprasService.findAllItensPedidoCompra();
  }

  @Get('itens-pedido-compra/:id')
  findOneItensPedidoCompra(@Param('id') id: string) {
    return this.comprasService.findOneItensPedidoCompra(id);
  }

  @Patch('itens-pedido-compra/:id')
  updateItensPedidoCompra(@Param('id') id: string, @Body() updateItensPedidoCompraDto: UpdateItensPedidoCompraDto) {
    return this.comprasService.updateItensPedidoCompra(id, updateItensPedidoCompraDto);
  }

  @Delete('itens-pedido-compra/:id')
  removeItensPedidoCompra(@Param('id') id: string) {
    return this.comprasService.removeItensPedidoCompra(id);
  }
}