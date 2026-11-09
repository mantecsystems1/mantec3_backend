import { Controller, Get, Post, Body, Patch, Param, Delete, Req, ForbiddenException, Query } from '@nestjs/common';
import type { Request } from 'express';
import { RecebimentoEquipamentoService } from './recebimento-equipamento.service';
import { CreateRecebimentoEquipamentoDto } from './dto/create-recebimento-equipamento.dto';
import { UpdateRecebimentoEquipamentoDto } from './dto/update-recebimento-equipamento.dto';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO, perfilPodeExecutarEvento } from '../../permissoes/matriz-permissoes';
import { RecebimentoCompletoService } from './recebimento-completo.service';
import { CreateRecebimentoCompletoDto } from './dto/create-recebimento-completo.dto';
import { EncerrarSemReparoDto } from './dto/encerrar-sem-reparo.dto';
import { RegistrarDevolucaoDto } from './dto/registrar-devolucao.dto';

@Controller('recebimento-equipamento')
export class RecebimentoEquipamentoController {
  constructor(private readonly recebimentoEquipamentoService: RecebimentoEquipamentoService, private readonly completoService: RecebimentoCompletoService) {}

  @Post('completo')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CRIAR)
  completo(@Body() dto: CreateRecebimentoCompletoDto, @Req() req: Request, @CurrentUser() user?: CurrentUserPayload) {
    if (dto.termo) {
      const actor = user as (CurrentUserPayload & { role?: string; perfis?: string[] }) | undefined;
      const perfis = [actor?.perfil, actor?.role, ...(Array.isArray(actor?.perfis) ? actor.perfis : [])].filter((perfil): perfil is string => typeof perfil === 'string');
      if (!perfis.some((perfil) => perfilPodeExecutarEvento(perfil, EVENTOS_NEGOCIO.RECEBIMENTO_GERAR_TERMO))) throw new ForbiddenException('Seu perfil nao pode gerar o termo de entrada.');
      dto.termo.ipAssinatura = req.ip;
      dto.termo.userAgentAssinatura = req.headers['user-agent'];
    }
    return this.completoService.create(dto, user);
  }

  @Get('completo/pendentes')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  pendentes(@CurrentUser() user?: CurrentUserPayload) { return this.completoService.pendentes(user); }

  @Get('completo/:id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  getCompleto(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) { return this.completoService.get(id, user?.empresaId); }

  @Get('completo/operacoes/:operacaoId')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  porOperacao(@Param('operacaoId') operacaoId: string, @CurrentUser() user?: CurrentUserPayload) { return this.completoService.porOperacao(operacaoId, user); }

  @Post('completo/:id/confirmar')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  confirmar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) { return this.completoService.confirmar(id, user); }

  @Post(':id/sem-reparo')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  encerrarSemReparo(@Param('id') id: string, @Body() dto: EncerrarSemReparoDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.recebimentoEquipamentoService.encerrarSemReparo(id, dto, user);
  }

  @Post(':id/devolucao')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  registrarDevolucao(@Param('id') id: string, @Body() dto: RegistrarDevolucaoDto, @Req() req: Request, @CurrentUser() user?: CurrentUserPayload) {
    dto.ipAssinatura = req.ip;
    dto.userAgentAssinatura = req.headers['user-agent'];
    return this.recebimentoEquipamentoService.registrarDevolucao(id, dto, user);
  }

  @Post()
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CRIAR)
  create(
    @Body() createRecebimentoEquipamentoDto: CreateRecebimentoEquipamentoDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.recebimentoEquipamentoService.create(createRecebimentoEquipamentoDto, user);
  }

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.recebimentoEquipamentoService.findAll(user?.empresaId);
  }

  @Get('paginado')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  findAllPaginado(@Query() query: Record<string, unknown>, @CurrentUser() user?: CurrentUserPayload) {
    return this.recebimentoEquipamentoService.findAllPaginado(user?.empresaId, query);
  }

  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  findOne(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.recebimentoEquipamentoService.findOne(id, user?.empresaId);
  }

  @Patch(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_EDITAR)
  update(
    @Param('id') id: string,
    @Body() updateRecebimentoEquipamentoDto: UpdateRecebimentoEquipamentoDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.recebimentoEquipamentoService.update(id, updateRecebimentoEquipamentoDto, user);
  }

  @Delete(':id')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_REMOVER)
  remove(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.recebimentoEquipamentoService.remove(id, user);
  }
}
