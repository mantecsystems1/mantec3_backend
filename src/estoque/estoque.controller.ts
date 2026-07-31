import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { CreateMovimentoEstoqueDto } from './dto/create-movimento-estoque.dto';
import { UpdateMovimentoEstoqueDto } from './dto/update-movimento-estoque.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('estoque')
export class EstoqueController {
  constructor(private readonly estoqueService: EstoqueService) {}

  @Post('movimentos')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ESTOQUE_AJUSTAR)
  create(@Body() createMovimentoEstoqueDto: CreateMovimentoEstoqueDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.estoqueService.create(createMovimentoEstoqueDto, user?.id);
  }

  @Get('movimentos')
  findAll() {
    return this.estoqueService.findAll();
  }

  @Get('movimentos/:id')
  findOne(@Param('id') id: string) {
    return this.estoqueService.findOne(id);
  }

  @Get('saldo/:produtoId')
  getSaldoProduto(@Param('produtoId') produtoId: string) {
    return this.estoqueService.getSaldoProduto(produtoId);
  }

  @Get('disponibilidade')
  getDisponibilidadeProdutos() {
    return this.estoqueService.getDisponibilidadeProdutos();
  }

  @Get('disponibilidade/:produtoId')
  getDisponibilidadeProduto(@Param('produtoId') produtoId: string) {
    return this.estoqueService.getDisponibilidadeProduto(produtoId);
  }

  @Patch('movimentos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ESTOQUE_AJUSTAR)
  update(
    @Param('id') id: string,
    @Body() updateMovimentoEstoqueDto: UpdateMovimentoEstoqueDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.estoqueService.update(id, updateMovimentoEstoqueDto, user?.id);
  }

  @Delete('movimentos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.ESTOQUE_ESTORNAR)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.estoqueService.remove(id, user?.id);
  }
}
