import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CreateItensOrcamentoDto } from './dto/create-itens-orcamento.dto';
import { UpdateItensOrcamentoDto } from './dto/update-itens-orcamento.dto';

@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentosService: OrcamentosService) {}

  @Post()
  create(@Body() createOrcamentoDto: CreateOrcamentoDto) {
    return this.orcamentosService.create(createOrcamentoDto);
  }

  @Get()
  findAll() {
    return this.orcamentosService.findAll();
  }

  @Post('itens')
  createItem(@Body() createItensOrcamentoDto: CreateItensOrcamentoDto) {
    return this.orcamentosService.createItem(createItensOrcamentoDto);
  }

  @Get('itens')
  findAllItems() {
    return this.orcamentosService.findAllItems();
  }

  @Get('itens/:id')
  findOneItem(@Param('id') id: string) {
    return this.orcamentosService.findOneItem(id);
  }

  @Patch('itens/:id')
  updateItem(@Param('id') id: string, @Body() updateItensOrcamentoDto: UpdateItensOrcamentoDto) {
    return this.orcamentosService.updateItem(id, updateItensOrcamentoDto);
  }

  @Delete('itens/:id')
  removeItem(@Param('id') id: string) {
    return this.orcamentosService.removeItem(id);
  }

  @Get(':id/itens')
  findItemsByOrcamento(@Param('id') id: string) {
    return this.orcamentosService.findItemsByOrcamento(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orcamentosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrcamentoDto: UpdateOrcamentoDto) {
    return this.orcamentosService.update(id, updateOrcamentoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orcamentosService.remove(id);
  }
}
