import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DocumentosService } from './documentos.service';

@Controller('documentos')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Get('orcamentos/:id/pdf')
  async orcamentoPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarOrcamentoPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, `orcamento-${id}.pdf`);
  }

  @Get('vendas/:id/recibo.pdf')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  async reciboPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarReciboPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, `recibo-${id}.pdf`);
  }

  @Get('recebimentos/:id/termo.pdf')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_GERAR_TERMO)
  async termoPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarTermoPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, `termo-recebimento-${id}.pdf`);
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
