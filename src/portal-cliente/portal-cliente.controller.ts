import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get(':token/atendimentos/:atendimentoId/pdf')
  async atendimentoPdf(
    @Param('token') token: string,
    @Param('atendimentoId') atendimentoId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.portalClienteService.gerarAtendimentoPdf(token, atendimentoId);
    this.sendPdf(res, pdf, `atendimento-${atendimentoId}.pdf`);
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

  private sendPdf(res: Response, pdf: Buffer, filename: string) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }
}
