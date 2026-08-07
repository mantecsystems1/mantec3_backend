import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CompatibilidadeService } from './compatibilidade.service';
import { CreateCompatibilidadeProdutoDto } from './dto/create-compatibilidade-produto.dto';
import { UpdateCompatibilidadeProdutoDto } from './dto/update-compatibilidade-produto.dto';
import { CreateAparelhoModeloDto } from './dto/create-aparelho-modelo.dto';
import { UpdateAparelhoModeloDto } from './dto/update-aparelho-modelo.dto';
import { CreateCompatibilidadeModeloDto } from './dto/create-compatibilidade-modelo.dto';
import { UpdateCompatibilidadeModeloDto } from './dto/update-compatibilidade-modelo.dto';
import { ImportCompatibilidadePeliculasDto } from './dto/import-compatibilidade-peliculas.dto';
import { ClassificarProdutosCompatibilidadeDto } from './dto/classificar-produtos-compatibilidade.dto';

@Controller('compatibilidade')
export class CompatibilidadeController {
  constructor(private readonly compatibilidadeService: CompatibilidadeService) {}

  @Post()
  create(@Body() createDto: CreateCompatibilidadeProdutoDto) {
    return this.compatibilidadeService.create(createDto);
  }

  @Get()
  findAll() {
    return this.compatibilidadeService.findAll();
  }

  @Get('produto/:produtoId')
  findAllByProduto(@Param('produtoId') produtoId: string) {
    return this.compatibilidadeService.findAllByProduto(produtoId);
  }

  @Post('peliculas/importar')
  importarCompatibilidadePeliculas(@Body() importDto: ImportCompatibilidadePeliculasDto) {
    return this.compatibilidadeService.importarCompatibilidadePeliculas(importDto);
  }

  @Post('produtos/classificar')
  classificarProdutos(@Body() dto: ClassificarProdutosCompatibilidadeDto) {
    return this.compatibilidadeService.classificarProdutosExistentes(dto.empresaId);
  }

  @Post('modelos')
  createModelo(@Body() createDto: CreateAparelhoModeloDto) {
    return this.compatibilidadeService.createModelo(createDto);
  }

  @Get('modelos')
  findAllModelos(@Query('empresaId') empresaId?: string) {
    return this.compatibilidadeService.findAllModelos(empresaId);
  }

  @Get('modelos/:id')
  findOneModelo(@Param('id') id: string) {
    return this.compatibilidadeService.findOneModelo(id);
  }

  @Patch('modelos/:id')
  updateModelo(@Param('id') id: string, @Body() updateDto: UpdateAparelhoModeloDto) {
    return this.compatibilidadeService.updateModelo(id, updateDto);
  }

  @Delete('modelos/:id')
  removeModelo(@Param('id') id: string) {
    return this.compatibilidadeService.removeModelo(id);
  }

  @Post('modelos-relacoes')
  createCompatibilidadeModelo(@Body() createDto: CreateCompatibilidadeModeloDto) {
    return this.compatibilidadeService.createCompatibilidadeModelo(createDto);
  }

  @Get('modelos-relacoes')
  findAllCompatibilidadesModelo(@Query('empresaId') empresaId?: string) {
    return this.compatibilidadeService.findAllCompatibilidadesModelo(empresaId);
  }

  @Get('modelos-relacoes/:id')
  findOneCompatibilidadeModelo(@Param('id') id: string) {
    return this.compatibilidadeService.findOneCompatibilidadeModelo(id);
  }

  @Patch('modelos-relacoes/:id')
  updateCompatibilidadeModelo(@Param('id') id: string, @Body() updateDto: UpdateCompatibilidadeModeloDto) {
    return this.compatibilidadeService.updateCompatibilidadeModelo(id, updateDto);
  }

  @Delete('modelos-relacoes/:id')
  removeCompatibilidadeModelo(@Param('id') id: string) {
    return this.compatibilidadeService.removeCompatibilidadeModelo(id);
  }

  @Get('peliculas/sugestoes')
  getSugestoesPeliculas(
    @Query('empresaId') empresaId?: string,
    @Query('marca') marca?: string,
    @Query('modelo') modelo?: string,
    @Query('origemTipo') origemTipo?: string,
    @Query('origemId') origemId?: string,
  ) {
    return this.compatibilidadeService.getSugestoesPeliculas({ empresaId, marca, modelo, origemTipo, origemId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.compatibilidadeService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateCompatibilidadeProdutoDto) {
    return this.compatibilidadeService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.compatibilidadeService.remove(id);
  }
}
