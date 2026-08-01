import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { UpsertTemplateComunicacaoDto } from './dto/upsert-template-comunicacao.dto';
import { TemplateComunicacaoService } from './template-comunicacao.service';

@Controller('comunicacao/templates')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class TemplateComunicacaoController {
  constructor(private readonly templateService: TemplateComunicacaoService) {}

  @Get()
  @RequireEvento(EVENTOS_NEGOCIO.NOTIFICACAO_ENVIAR)
  findAll(@CurrentUser() user?: CurrentUserPayload) {
    return this.templateService.findAll(user);
  }

  @Get(':chave')
  @RequireEvento(EVENTOS_NEGOCIO.NOTIFICACAO_ENVIAR)
  findByChave(@Param('chave') chave: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.templateService.findByChave(chave, user);
  }

  @Put(':chave')
  @RequireEvento(EVENTOS_NEGOCIO.COMUNICACAO_TEMPLATE_GERENCIAR)
  upsert(
    @Param('chave') chave: string,
    @Body() dto: UpsertTemplateComunicacaoDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.templateService.upsert({ ...dto, chave }, user);
  }
}
