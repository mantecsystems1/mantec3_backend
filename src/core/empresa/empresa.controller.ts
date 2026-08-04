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
  create(@Body() dto: CreateEmpresaDto) {
    return this.empresaService.create(dto);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_CONSULTAR)
  findAll() {
    return this.empresaService.findAll();
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_CONSULTAR)
  findOne(@Param('id') id: string) {
    return this.empresaService.findOne(id);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_GERENCIAR)
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaDto) {
    return this.empresaService.update(id, dto);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.EMPRESA_GERENCIAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.empresaService.remove(id, user?.id || user?._id || user?.sub);
  }
}
