import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { GarantiasService } from './garantias.service';
import { CreateGarantiaDto } from './dto/create-garantia.dto';
import { UpdateGarantiaDto } from './dto/update-garantia.dto';
import { CreateEnvioGarantiaDto } from './dto/create-envio-garantia.dto';
import { UpdateEnvioGarantiaDto } from './dto/update-envio-garantia.dto';
import { CreateRetornoGarantiaDto } from './dto/create-retorno-garantia.dto';
import { UpdateRetornoGarantiaDto } from './dto/update-retorno-garantia.dto';
import { CreateCreditoFornecedorDto } from './dto/create-credito-fornecedor.dto';
import { UpdateCreditoFornecedorDto } from './dto/update-credito-fornecedor.dto';
import { AuthTokenGuard } from '../common/guards/auth-token.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireEvento, RequireEventoFromBody } from '../common/decorators/require-evento.decorator';
import { EVENTOS_NEGOCIO } from '../permissoes/matriz-permissoes';
import { GARANTIA_STATUS } from './state/garantia.states';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller('garantias')
export class GarantiasController {
  constructor(private readonly garantiasService: GarantiasService) {}

  @Post()
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_ABRIR)
  createGarantia(@Body() createGarantiaDto: CreateGarantiaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.createGarantia(createGarantiaDto, user?.sub);
  }

  @Get()
  findAllGarantias() {
    return this.garantiasService.findAllGarantias();
  }

  @Get(':id')
  findOneGarantia(@Param('id') id: string) {
    return this.garantiasService.findOneGarantia(id);
  }

  @Post(':id/enviar-fornecedor')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR)
  enviarFornecedor(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.updateGarantia(
      id,
      { status: GARANTIA_STATUS.ENVIADA_FORNECEDOR },
      user?.sub,
    );
  }

  @Post(':id/iniciar-analise')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  iniciarAnalise(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.updateGarantia(
      id,
      { status: GARANTIA_STATUS.EM_ANALISE },
      user?.sub,
    );
  }

  @Post(':id/aprovar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  aprovar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.updateGarantia(
      id,
      { status: GARANTIA_STATUS.APROVADA },
      user?.sub,
    );
  }

  @Post(':id/recusar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  recusar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.updateGarantia(
      id,
      { status: GARANTIA_STATUS.RECUSADA },
      user?.sub,
    );
  }

  @Post(':id/finalizar')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_FINALIZAR)
  finalizar(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.garantiasService.updateGarantia(
      id,
      { status: GARANTIA_STATUS.CONCLUIDA },
      user?.sub,
    );
  }

  @Patch(':id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEventoFromBody('status', {
    enviada_fornecedor: EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR,
    em_analise: EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO,
    aprovada: EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO,
    recusada: EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO,
    concluida: EVENTOS_NEGOCIO.GARANTIA_FINALIZAR,
  }, EVENTOS_NEGOCIO.GARANTIA_FINALIZAR)
  updateGarantia(
    @Param('id') id: string,
    @Body() updateGarantiaDto: UpdateGarantiaDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.garantiasService.updateGarantia(id, updateGarantiaDto, user?.sub);
  }

  @Delete(':id')
  removeGarantia(@Param('id') id: string) {
    return this.garantiasService.removeGarantia(id);
  }

  @Post('envios')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR)
  createEnvioGarantia(@Body() createEnvioGarantiaDto: CreateEnvioGarantiaDto) {
    return this.garantiasService.createEnvioGarantia(createEnvioGarantiaDto);
  }

  @Get('envios')
  findAllEnvioGarantias() {
    return this.garantiasService.findAllEnvioGarantias();
  }

  @Get('envios/:id')
  findOneEnvioGarantia(@Param('id') id: string) {
    return this.garantiasService.findOneEnvioGarantia(id);
  }

  @Patch('envios/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR)
  updateEnvioGarantia(@Param('id') id: string, @Body() updateEnvioGarantiaDto: UpdateEnvioGarantiaDto) {
    return this.garantiasService.updateEnvioGarantia(id, updateEnvioGarantiaDto);
  }

  @Delete('envios/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR)
  removeEnvioGarantia(@Param('id') id: string) {
    return this.garantiasService.removeEnvioGarantia(id);
  }

  @Post('retornos')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  createRetornoGarantia(@Body() createRetornoGarantiaDto: CreateRetornoGarantiaDto) {
    return this.garantiasService.createRetornoGarantia(createRetornoGarantiaDto);
  }

  @Get('retornos')
  findAllRetornoGarantias() {
    return this.garantiasService.findAllRetornoGarantias();
  }

  @Get('retornos/:id')
  findOneRetornoGarantia(@Param('id') id: string) {
    return this.garantiasService.findOneRetornoGarantia(id);
  }

  @Patch('retornos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  updateRetornoGarantia(@Param('id') id: string, @Body() updateRetornoGarantiaDto: UpdateRetornoGarantiaDto) {
    return this.garantiasService.updateRetornoGarantia(id, updateRetornoGarantiaDto);
  }

  @Delete('retornos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO)
  removeRetornoGarantia(@Param('id') id: string) {
    return this.garantiasService.removeRetornoGarantia(id);
  }

  @Post('creditos')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_FINALIZAR)
  createCreditoFornecedor(@Body() createCreditoFornecedorDto: CreateCreditoFornecedorDto) {
    return this.garantiasService.createCreditoFornecedor(createCreditoFornecedorDto);
  }

  @Get('creditos')
  findAllCreditoFornecedores() {
    return this.garantiasService.findAllCreditoFornecedores();
  }

  @Get('creditos/:id')
  findOneCreditoFornecedor(@Param('id') id: string) {
    return this.garantiasService.findOneCreditoFornecedor(id);
  }

  @Patch('creditos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_FINALIZAR)
  updateCreditoFornecedor(@Param('id') id: string, @Body() updateCreditoFornecedorDto: UpdateCreditoFornecedorDto) {
    return this.garantiasService.updateCreditoFornecedor(id, updateCreditoFornecedorDto);
  }

  @Delete('creditos/:id')
  @UseGuards(AuthTokenGuard, PermissionGuard)
  @RequireEvento(EVENTOS_NEGOCIO.GARANTIA_FINALIZAR)
  removeCreditoFornecedor(@Param('id') id: string) {
    return this.garantiasService.removeCreditoFornecedor(id);
  }
}
