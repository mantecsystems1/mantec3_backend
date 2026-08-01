import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { NotaFiscalServicoService } from './nota-fiscal-servico.service';
import { CreateNotaFiscalServicoDto } from './dto/create-nota-fiscal-servico.dto';
import { UpdateNotaFiscalServicoDto } from './dto/update-nota-fiscal-servico.dto';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('nota-fiscal-servico')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class NotaFiscalServicoController {
  constructor(private readonly notaFiscalServicoService: NotaFiscalServicoService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  create(@Body() createNotaFiscalServicoDto: CreateNotaFiscalServicoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.notaFiscalServicoService.create(createNotaFiscalServicoDto, user?.id, user?.empresaId);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.notaFiscalServicoService.findAll(user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.notaFiscalServicoService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  update(@Param('id') id: string, @Body() updateNotaFiscalServicoDto: UpdateNotaFiscalServicoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.notaFiscalServicoService.update(id, updateNotaFiscalServicoDto, user?.id, user?.empresaId);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CANCELAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.notaFiscalServicoService.remove(id, user?.id, user?.empresaId);
  }
}
