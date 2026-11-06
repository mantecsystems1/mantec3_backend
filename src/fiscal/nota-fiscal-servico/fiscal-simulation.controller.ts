import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, Query, Res, StreamableFile, Body } from '@nestjs/common';
import { BindFiscalEmitterDto, FiscalProfileDto, RegisterFiscalEmitterDto, UploadFiscalCertificateDto } from './fiscal-configuration.dto';
import type { Response } from 'express';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { FiscalSimulationService } from './fiscal-simulation.service';

@Controller('fiscal-simulacoes')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class FiscalSimulationController {
  constructor(private readonly service: FiscalSimulationService) {}
  @Get('configuracao/pendencias')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  pending(@CurrentUser() user?: CurrentUserPayload, @Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');
    return this.service.pendingStatus(user);
  }
  @Post('configuracao/certificado')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  uploadCertificate(@Body() dto: UploadFiscalCertificateDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.uploadCertificate(dto, user);
  }
  @Get('configuracao/certificado')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  certificate(@CurrentUser() user?: CurrentUserPayload) { return this.service.certificateStatus(user); }
  @Get('configuracao/cadastro')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  registration(@CurrentUser() user?: CurrentUserPayload) { return this.service.registrationStatus(user); }
  @Post('configuracao/cadastro')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  register(@Body() dto: RegisterFiscalEmitterDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.registerEmitter(dto, user);
  }
  @Post('configuracao/vinculo')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  bind(@Body() dto: BindFiscalEmitterDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.bindEmitter(dto.emitterId, user);
  }
  @Get('configuracao/perfis')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  profiles(@CurrentUser() user?: CurrentUserPayload) { return this.service.fiscalProfiles(user); }
  @Post('configuracao/perfis')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  profile(@Body() dto: FiscalProfileDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.addFiscalProfile(dto, user);
  }
  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  history(@CurrentUser() user?: CurrentUserPayload, @Query('before') before?: string) {
    return this.service.history(user?.empresaId, before);
  }
  @Get(':id/comprovante')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  async receipt(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: CurrentUserPayload, @Res({ passthrough: true }) res: Response) {
    const receipt = await this.service.receipt(id, user?.empresaId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Content-SHA256', receipt.sha256);
    return new StreamableFile(Buffer.from(receipt.content), { type: 'application/json; charset=utf-8',
      disposition: `attachment; filename="simulacao-${id}.json"` });
  }
  @Get('configuracao')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  availability(@CurrentUser() user?: CurrentUserPayload) { return this.service.availability(user?.empresaId); }
  @Post(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)
  submit(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.submit(id, user?.empresaId);
  }
  @Get(':id')
  @RequireEvento(EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.get(id, user?.empresaId);
  }
}
