import { isPlatformAdmin, requirePlatformAdmin, tenantFilter } from '../../common/security/tenant-access';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('empresas')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_GERENCIAR)
  create(@Body() dto: CreateEmpresaDto, @CurrentUser() user: CurrentUserPayload) {
    requirePlatformAdmin(user);
    return this.empresaService.create(dto);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_CONSULTAR)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    tenantFilter(user);
    return this.empresaService.findAll(isPlatformAdmin(user) ? undefined : user.empresaId);
  }

  @Get('minha')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_CONSULTAR)
  findMinha(@CurrentUser() user: CurrentUserPayload) {
    tenantFilter(user);
    return this.empresaService.findOne(user.empresaId);
  }

  @Patch('minha')
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_GERENCIAR)
  updateMinha(@Body() dto: UpdateEmpresaDto, @CurrentUser() user: CurrentUserPayload) {
    tenantFilter(user);
    const updateDto = { ...dto };
    delete (updateDto as { ativa?: boolean }).ativa;
    return this.empresaService.update(user.empresaId, updateDto);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    tenantFilter(user);
    if (!isPlatformAdmin(user) && id !== user.empresaId) requirePlatformAdmin(user);
    return this.empresaService.findOne(id);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_GERENCIAR)
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaDto, @CurrentUser() user: CurrentUserPayload) {
    requirePlatformAdmin(user);
    return this.empresaService.update(id, dto);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_GERENCIAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    requirePlatformAdmin(user);
    return this.empresaService.remove(id, user?.id || user?._id || user?.sub);
  }
}
