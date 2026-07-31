import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';

@ApiTags('clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.CLIENTE_CRIAR)
  @ApiOperation({ summary: 'Criar cliente' })
  @ApiResponse({ status: 201, description: 'Cliente criado com sucesso.' })
  create(@Body() createClienteDto: CreateClienteDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.clientesService.create(createClienteDto, user?.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os clientes' })
  @ApiResponse({ status: 200, description: 'Lista de clientes.' })
  findAll() {
    return this.clientesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cliente por ID' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado.' })
  @ApiResponse({ status: 404, description: 'Cliente nao encontrado.' })
  findOne(@Param('id') id: string) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.CLIENTE_EDITAR)
  @ApiOperation({ summary: 'Atualizar cliente' })
  @ApiResponse({ status: 200, description: 'Cliente atualizado.' })
  @ApiResponse({ status: 404, description: 'Cliente nao encontrado.' })
  update(@Param('id') id: string, @Body() updateClienteDto: UpdateClienteDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.clientesService.update(id, updateClienteDto, user?.sub);
  }

  @Delete(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.CLIENTE_REMOVER)
  @ApiOperation({ summary: 'Remover cliente' })
  @ApiResponse({ status: 200, description: 'Cliente removido.' })
  @ApiResponse({ status: 404, description: 'Cliente nao encontrado.' })
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.clientesService.remove(id, user?.sub);
  }
}
