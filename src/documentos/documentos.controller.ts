import { BadRequestException, Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
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
  @RequireEvento(EVENTOS_NEGOCIO.ORCAMENTO_CONSULTAR)
  async orcamentoPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarOrcamentoPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, 'orcamento.pdf');
  }

  @Get('vendas/:id/recibo.pdf')
  @RequireEvento(EVENTOS_NEGOCIO.VENDA_CONSULTAR)
  async reciboPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarReciboPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, 'recibo.pdf');
  }

  @Get('recebimentos/:id/termo.pdf')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_GERAR_TERMO)
  async termoPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.documentosService.gerarTermoPdf(id, user?.empresaId);
    this.sendPdf(res, pdf, 'termo-recebimento.pdf');
  }

  @Get('ordens-servico/:id/checklist-qualidade/revisoes')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  listarRevisoesChecklistQualidade(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.documentosService.listarRevisoesChecklistQualidade(id, user?.empresaId);
  }

  @Get('ordens-servico/:id/checklist-qualidade/revisoes/:revisao/pdf')
  @RequireEvento(EVENTOS_NEGOCIO.OS_CONSULTAR)
  async checklistQualidadePdf(
    @Param('id') id: string,
    @Param('revisao') revisao: string,
    @Res() res: Response,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const numeroRevisao = Number(revisao);
    if (!Number.isSafeInteger(numeroRevisao) || numeroRevisao < 1) {
      throw new BadRequestException('Revisão do checklist inválida.');
    }
    const pdf = await this.documentosService.gerarChecklistQualidadePdf(id, numeroRevisao, user?.empresaId);
    this.sendPdf(res, pdf, `checklist-qualidade-revisao-${numeroRevisao}.pdf`);
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
