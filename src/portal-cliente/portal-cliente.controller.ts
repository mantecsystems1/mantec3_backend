import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PortalClienteService } from './portal-cliente.service';

@Controller('portal-cliente')
export class PortalClienteController {
  constructor(private readonly portalClienteService: PortalClienteService) {}

  @Post('clientes/:clienteId/sessao')
  @UseGuards(AuthTokenGuard)
  criarSessaoCliente(
    @Param('clienteId') clienteId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.portalClienteService.criarSessaoCliente(clienteId, user?.empresaId);
  }

  @Get(':token')
  getPortal(@Param('token') token: string) {
    return this.portalClienteService.getPortal(token);
  }

  @Post(':token/orcamentos/:orcamentoId/aprovar')
  aprovarOrcamento(@Param('token') token: string, @Param('orcamentoId') orcamentoId: string) {
    return this.portalClienteService.decidirOrcamento(token, orcamentoId, 'aprovar');
  }

  @Post(':token/orcamentos/:orcamentoId/reprovar')
  reprovarOrcamento(
    @Param('token') token: string,
    @Param('orcamentoId') orcamentoId: string,
    @Body() _body?: { observacao?: string },
  ) {
    return this.portalClienteService.decidirOrcamento(token, orcamentoId, 'reprovar');
  }
}
