import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { DocumentosService } from './documentos.service';

@Controller('documentos')
@UseGuards(AuthTokenGuard)
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Get('orcamentos/:id/pdf')
  async orcamentoPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.documentosService.gerarOrcamentoPdf(id);
    this.sendPdf(res, pdf, `orcamento-${id}.pdf`);
  }

  @Get('vendas/:id/recibo.pdf')
  async reciboPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.documentosService.gerarReciboPdf(id);
    this.sendPdf(res, pdf, `recibo-${id}.pdf`);
  }

  @Get('recebimentos/:id/termo.pdf')
  async termoPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.documentosService.gerarTermoPdf(id);
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
