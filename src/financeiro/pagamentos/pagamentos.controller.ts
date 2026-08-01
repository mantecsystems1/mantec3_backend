import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { PagamentosService } from './pagamentos.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('pagamentos')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class PagamentosController {
  constructor(private readonly pagamentosService: PagamentosService) {}

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR)
  create(@Body() createPagamentoDto: CreatePagamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.pagamentosService.create(createPagamentoDto, user?.id, user?.empresaId);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.PAGAMENTO_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.pagamentosService.findAll(user?.empresaId);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.PAGAMENTO_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.pagamentosService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.PAGAMENTO_ESTORNAR)
  update(@Param('id') id: string, @Body() updatePagamentoDto: UpdatePagamentoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.pagamentosService.update(id, updatePagamentoDto, user?.id, user?.empresaId);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.PAGAMENTO_ESTORNAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.pagamentosService.remove(id, user?.id, user?.empresaId);
  }
}
