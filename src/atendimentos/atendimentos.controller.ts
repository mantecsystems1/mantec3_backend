import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { AtendimentosService } from './atendimentos.service';

@Controller('atendimentos')
export class AtendimentosController {
  constructor(private readonly atendimentos: AtendimentosService) {}

  @Get(':recebimentoId')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  ficha(@Param('recebimentoId') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.atendimentos.ficha(id, user);
  }
}
