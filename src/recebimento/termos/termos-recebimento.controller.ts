import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { TermosRecebimentoService } from './termos-recebimento.service';
import { CreateTermosRecebimentoDto } from './dto/create-termos-recebimento.dto';
import { UpdateTermosRecebimentoDto } from './dto/update-termos-recebimento.dto';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('termos-recebimento')
export class TermosRecebimentoController {
  constructor(private readonly termosRecebimentoService: TermosRecebimentoService) {}

  @Post()
  create(
    @Body() createTermosRecebimentoDto: CreateTermosRecebimentoDto,
    @Req() req: any,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.termosRecebimentoService.create(this.comMetadadosAssinatura(createTermosRecebimentoDto, req), user);
  }

  @Get()
  findAll() {
    return this.termosRecebimentoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.termosRecebimentoService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTermosRecebimentoDto: UpdateTermosRecebimentoDto,
    @Req() req: any,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.termosRecebimentoService.update(id, this.comMetadadosAssinatura(updateTermosRecebimentoDto, req), user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.termosRecebimentoService.remove(id);
  }

  private comMetadadosAssinatura<T extends CreateTermosRecebimentoDto | UpdateTermosRecebimentoDto>(dto: T, req: any): T {
    if (!dto.assinado) {
      return dto;
    }

    return {
      ...dto,
      ipAssinatura: dto.ipAssinatura || this.getClientIp(req),
      userAgentAssinatura: dto.userAgentAssinatura || req?.headers?.['user-agent'],
    };
  }

  private getClientIp(req: any) {
    const forwardedFor = req?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }

    return req?.ip || req?.socket?.remoteAddress;
  }
}
