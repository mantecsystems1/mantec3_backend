import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { AuthTokenGuard } from '../../common/guards/auth-token.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireEvento } from '../../common/decorators/require-evento.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { EVENTOS_NEGOCIO } from '../../permissoes/matriz-permissoes';
import { FinanceiroAdmService } from './financeiro-adm.service';
import { CreateContaFinanceiraDto } from './dto/create-conta-financeira.dto';
import { UpdateContaFinanceiraDto } from './dto/update-conta-financeira.dto';
import { CreateCategoriaFinanceiraDto } from './dto/create-categoria-financeira.dto';
import { UpdateCategoriaFinanceiraDto } from './dto/update-categoria-financeira.dto';
import { CreateTituloFinanceiroDto } from './dto/create-titulo-financeiro.dto';
import { UpdateTituloFinanceiroDto } from './dto/update-titulo-financeiro.dto';
import { BaixarTituloFinanceiroDto } from './dto/baixar-titulo-financeiro.dto';
import { CreateMovimentoCaixaDto } from './dto/create-movimento-caixa.dto';
import { EstornarMovimentoCaixaDto } from './dto/estornar-movimento-caixa.dto';
import { CreateRecorrenciaFinanceiraDto } from './dto/create-recorrencia-financeira.dto';
import { UpdateRecorrenciaFinanceiraDto } from './dto/update-recorrencia-financeira.dto';
import { GerarRecorrenciasFinanceirasDto } from './dto/gerar-recorrencias-financeiras.dto';
import { CreateAnexoFinanceiroDto } from './dto/create-anexo-financeiro.dto';
import { ListAnexosFinanceirosQueryDto } from './dto/list-anexos-financeiros-query.dto';
import { RelatorioMensalFinanceiroQueryDto } from './dto/relatorio-mensal-financeiro-query.dto';

mkdirSync('./uploads/financeiro-provas', { recursive: true });

const anexoFinanceiroStorage = diskStorage({
  destination: './uploads/financeiro-provas',
  filename: (_req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `prova-financeira-${suffix}${extname(file.originalname)}`);
  },
});

@Controller('financeiro-adm')
@UseGuards(AuthTokenGuard, PermissionGuard)
export class FinanceiroAdmController {
  constructor(private readonly financeiroAdmService: FinanceiroAdmService) {}

  @Get('relatorios/mensal')
  @RequireEvento(EVENTOS_NEGOCIO.RELATORIO_FINANCEIRO_GERAR)
  relatorioMensal(@Query() query: RelatorioMensalFinanceiroQueryDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.getRelatorioMensalDados(query, user?.empresaId);
  }

  @Get('relatorios/mensal.pdf')
  @RequireEvento(EVENTOS_NEGOCIO.RELATORIO_FINANCEIRO_GERAR)
  async relatorioMensalPdf(@Query() query: RelatorioMensalFinanceiroQueryDto, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const pdf = await this.financeiroAdmService.gerarRelatorioMensalPdf(query, user?.id, user?.empresaId);
    this.sendArquivo(res, pdf, 'application/pdf', `relatorio-financeiro-${this.filenameCompetencia(query)}.pdf`);
  }

  @Get('relatorios/mensal.xlsx')
  @RequireEvento(EVENTOS_NEGOCIO.RELATORIO_FINANCEIRO_GERAR)
  async relatorioMensalXlsx(@Query() query: RelatorioMensalFinanceiroQueryDto, @Res() res: Response, @CurrentUser() user?: CurrentUserPayload) {
    const xlsx = await this.financeiroAdmService.gerarRelatorioMensalXlsx(query, user?.id, user?.empresaId);
    this.sendArquivo(
      res,
      xlsx,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `relatorio-financeiro-${this.filenameCompetencia(query)}.xlsx`,
    );
  }

  @Get('anexos')
  @RequireEvento(EVENTOS_NEGOCIO.ANEXO_FINANCEIRO_CONSULTAR)
  findAllAnexos(@Query() query: ListAnexosFinanceirosQueryDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllAnexos(query, user?.empresaId);
  }

  @Post('anexos/upload')
  @RequireEvento(EVENTOS_NEGOCIO.ANEXO_FINANCEIRO_GERENCIAR)
  @UseInterceptors(FileInterceptor('arquivo', { storage: anexoFinanceiroStorage, limits: { fileSize: 15 * 1024 * 1024 } }))
  uploadAnexo(@UploadedFile() file: any, @Body() body: CreateAnexoFinanceiroDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createAnexo(body, file, user?.id, user?.empresaId);
  }

  @Delete('anexos/:id')
  @RequireEvento(EVENTOS_NEGOCIO.ANEXO_FINANCEIRO_GERENCIAR)
  removeAnexo(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.removeAnexo(id, user?.id, user?.empresaId);
  }

  @Post('contas')
  @RequireEvento(EVENTOS_NEGOCIO.CONTA_FINANCEIRA_GERENCIAR)
  createConta(@Body() dto: CreateContaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createConta(dto, user?.id, user?.empresaId);
  }

  @Get('contas')
  @RequireEvento(EVENTOS_NEGOCIO.CONTA_FINANCEIRA_CONSULTAR)
  findAllContas(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllContas(user?.empresaId, query);
  }

  @Get('contas/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CONTA_FINANCEIRA_CONSULTAR)
  findOneConta(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findOneConta(id, user?.empresaId);
  }

  @Patch('contas/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CONTA_FINANCEIRA_GERENCIAR)
  updateConta(@Param('id') id: string, @Body() dto: UpdateContaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.updateConta(id, dto, user?.id, user?.empresaId);
  }

  @Delete('contas/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CONTA_FINANCEIRA_GERENCIAR)
  removeConta(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.removeConta(id, user?.id, user?.empresaId);
  }

  @Post('categorias')
  @RequireEvento(EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_GERENCIAR)
  createCategoria(@Body() dto: CreateCategoriaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createCategoria(dto, user?.id, user?.empresaId);
  }

  @Get('categorias')
  @RequireEvento(EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_CONSULTAR)
  findAllCategorias(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllCategorias(user?.empresaId, query);
  }

  @Get('categorias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_CONSULTAR)
  findOneCategoria(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findOneCategoria(id, user?.empresaId);
  }

  @Patch('categorias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_GERENCIAR)
  updateCategoria(@Param('id') id: string, @Body() dto: UpdateCategoriaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.updateCategoria(id, dto, user?.id, user?.empresaId);
  }

  @Delete('categorias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_GERENCIAR)
  removeCategoria(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.removeCategoria(id, user?.id, user?.empresaId);
  }

  @Post('titulos')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_GERENCIAR)
  createTitulo(@Body() dto: CreateTituloFinanceiroDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createTitulo(dto, user?.id, user?.empresaId);
  }

  @Get('titulos')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_CONSULTAR)
  findAllTitulos(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllTitulos(user?.empresaId, query);
  }

  @Post('titulos/:id/baixar')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_BAIXAR)
  baixarTitulo(@Param('id') id: string, @Body() dto: BaixarTituloFinanceiroDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.baixarTitulo(id, dto, user?.id, user?.empresaId);
  }

  @Post('titulos/:id/cancelar')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_GERENCIAR)
  cancelarTitulo(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.cancelarTitulo(id, user?.id, user?.empresaId);
  }

  @Get('titulos/:id')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_CONSULTAR)
  findOneTitulo(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findOneTitulo(id, user?.empresaId);
  }

  @Patch('titulos/:id')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_GERENCIAR)
  updateTitulo(@Param('id') id: string, @Body() dto: UpdateTituloFinanceiroDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.updateTitulo(id, dto, user?.id, user?.empresaId);
  }

  @Delete('titulos/:id')
  @RequireEvento(EVENTOS_NEGOCIO.TITULO_FINANCEIRO_GERENCIAR)
  removeTitulo(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.cancelarTitulo(id, user?.id, user?.empresaId);
  }

  @Get('livro-caixa')
  @RequireEvento(EVENTOS_NEGOCIO.LIVRO_CAIXA_CONSULTAR)
  livroCaixa(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.getLivroCaixa(user?.empresaId, query);
  }

  @Post('movimentos')
  @RequireEvento(EVENTOS_NEGOCIO.MOVIMENTO_CAIXA_REGISTRAR)
  createMovimento(@Body() dto: CreateMovimentoCaixaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createMovimento(dto, user?.id, user?.empresaId);
  }

  @Get('movimentos')
  @RequireEvento(EVENTOS_NEGOCIO.LIVRO_CAIXA_CONSULTAR)
  findAllMovimentos(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllMovimentos(user?.empresaId, query);
  }

  @Post('movimentos/:id/estornar')
  @RequireEvento(EVENTOS_NEGOCIO.MOVIMENTO_CAIXA_ESTORNAR)
  estornarMovimento(@Param('id') id: string, @Body() dto: EstornarMovimentoCaixaDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.estornarMovimento(id, dto, user?.id, user?.empresaId);
  }

  @Get('movimentos/:id')
  @RequireEvento(EVENTOS_NEGOCIO.LIVRO_CAIXA_CONSULTAR)
  findOneMovimento(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findOneMovimento(id, user?.empresaId);
  }

  @Post('recorrencias')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_GERENCIAR)
  createRecorrencia(@Body() dto: CreateRecorrenciaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.createRecorrencia(dto, user?.id, user?.empresaId);
  }

  @Get('recorrencias')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_CONSULTAR)
  findAllRecorrencias(@Query() query: Record<string, string | undefined>, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findAllRecorrencias(user?.empresaId, query);
  }

  @Post('recorrencias/gerar-pendentes')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_PROCESSAR)
  gerarRecorrenciasPendentes(@Body() dto: GerarRecorrenciasFinanceirasDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.gerarRecorrenciasPendentes(dto, user?.id, user?.empresaId);
  }

  @Post('recorrencias/:id/gerar-proximo')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_PROCESSAR)
  gerarProximoTituloRecorrente(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.gerarProximoTituloRecorrente(id, user?.id, user?.empresaId);
  }

  @Get('recorrencias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_CONSULTAR)
  findOneRecorrencia(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.findOneRecorrencia(id, user?.empresaId);
  }

  @Patch('recorrencias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_GERENCIAR)
  updateRecorrencia(@Param('id') id: string, @Body() dto: UpdateRecorrenciaFinanceiraDto, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.updateRecorrencia(id, dto, user?.id, user?.empresaId);
  }

  @Delete('recorrencias/:id')
  @RequireEvento(EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_GERENCIAR)
  removeRecorrencia(@Param('id') id: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.financeiroAdmService.removeRecorrencia(id, user?.id, user?.empresaId);
  }

  private sendArquivo(res: Response, buffer: Buffer, contentType: string, filename: string) {
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  private filenameCompetencia(query: RelatorioMensalFinanceiroQueryDto) {
    if (query.competencia) return query.competencia;
    if (query.inicio) return query.inicio.slice(0, 7);
    return new Date().toISOString().slice(0, 7);
  }
}
