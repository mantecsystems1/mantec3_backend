import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';

@Controller('usuarios')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_GERENCIAR)
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_CONSULTAR)
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get('tecnicos')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CRIAR)
  findTecnicos(@CurrentUser() user?: CurrentUserPayload) {
    return this.usuariosService.findTecnicos(user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_CONSULTAR)
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_GERENCIAR)
  update(@Param('id') id: string, @Body() updateUsuarioDto: UpdateUsuarioDto) {
    return this.usuariosService.update(id, updateUsuarioDto);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.USUARIO_GERENCIAR)
  remove(@Param('id') id: string) {
    return this.usuariosService.remove(id);
  }
}
