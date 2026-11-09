import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { RascunhoRecebimentoService } from './rascunho-recebimento.service';
import { SalvarRascunhoRecebimentoDto } from './salvar-rascunho.dto';

@Controller('rascunhos-recebimento')
export class RascunhoRecebimentoController {
  constructor(private readonly service: RascunhoRecebimentoService) {}

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  listar(@CurrentUser() user?: CurrentUserPayload) { return this.service.listar(user); }

  @Get(':operacaoId')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  carregar(@Param('operacaoId') operacaoId: string, @CurrentUser() user?: CurrentUserPayload) { return this.service.carregar(operacaoId, user); }

  @Put(':operacaoId')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CRIAR)
  salvar(@Param('operacaoId') operacaoId: string, @Body() dto: SalvarRascunhoRecebimentoDto, @CurrentUser() user?: CurrentUserPayload) { return this.service.salvar(operacaoId, dto, user); }
}
