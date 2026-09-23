import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../decorators/current-user.decorator';
import { RequireEvento } from '../decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { PrivateUploadsService, type UploadArea } from './private-uploads.service';

@Controller('uploads')
export class PrivateUploadsController {
  constructor(private readonly privateUploadsService: PrivateUploadsService) {}

  @Get('produtos/:filename')
  @RequireEvento(EVENTOS_NEGOCIO.CATALOGO_CONSULTAR)
  getProdutoFile(@Param('filename') filename: string, @CurrentUser() user: CurrentUserPayload, @Res({ passthrough: true }) res: Response) {
    return this.sendFile('produtos', filename, user, res);
  }

  @Get('recebimentos/:filename')
  @RequireEvento(EVENTOS_NEGOCIO.RECEBIMENTO_CONSULTAR)
  getRecebimentoFile(@Param('filename') filename: string, @CurrentUser() user: CurrentUserPayload, @Res({ passthrough: true }) res: Response) {
    return this.sendFile('recebimentos', filename, user, res);
  }

  @Get('financeiro-provas/:filename')
  @RequireEvento(EVENTOS_NEGOCIO.ANEXO_FINANCEIRO_CONSULTAR)
  getFinanceiroFile(@Param('filename') filename: string, @CurrentUser() user: CurrentUserPayload, @Res({ passthrough: true }) res: Response) {
    return this.sendFile('financeiro-provas', filename, user, res);
  }

  private async sendFile(area: UploadArea, filename: string, user: CurrentUserPayload, res: Response) {
    const file = await this.privateUploadsService.getFile(area, filename, user?.empresaId);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `${file.disposition}; filename="${this.sanitizeHeaderFilename(file.filename)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });

    return new StreamableFile(file.stream);
  }

  private sanitizeHeaderFilename(filename: string) {
    return filename.replace(/["\r\n]/g, '');
  }
}
