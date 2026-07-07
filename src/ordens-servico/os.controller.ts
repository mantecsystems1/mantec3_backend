import { Controller, Get, Post, Body, Patch, Param, Delete, UsePipes, ValidationPipe } from '@nestjs/common';
import { OsService } from './os.service';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { CreateItensUtilizadosOSDto } from './dto/create-itens-utilizados-os.dto';
import { UpdateItensUtilizadosOSDto } from './dto/update-itens-utilizados-os.dto';

@Controller('ordens-servico')
export class OsController {
  constructor(private readonly osService: OsService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Body() createOrdemServicoDto: CreateOrdemServicoDto) {
    return this.osService.create(createOrdemServicoDto);
  }

  // OrdemServico routes

  @Get()
  findAll() {
    return this.osService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.osService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrdemServicoDto: UpdateOrdemServicoDto) {
    return this.osService.update(id, updateOrdemServicoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.osService.remove(id);
  }

  // ItensUtilizadosOS routes
  @Post('itens-utilizados')
  createItem(@Body() createItensUtilizadosOSDto: CreateItensUtilizadosOSDto) {
    return this.osService.createItem(createItensUtilizadosOSDto);
  }

  @Get('itens-utilizados')
  findAllItems() {
    return this.osService.findAllItems();
  }

  @Get('itens-utilizados/:id')
  findOneItem(@Param('id') id: string) {
    return this.osService.findOneItem(id);
  }

  @Patch('itens-utilizados/:id')
  updateItem(@Param('id') id: string, @Body() updateItensUtilizadosOSDto: UpdateItensUtilizadosOSDto) {
    return this.osService.updateItem(id, updateItensUtilizadosOSDto);
  }

  @Delete('itens-utilizados/:id')
  removeItem(@Param('id') id: string) {
    return this.osService.removeItem(id);
  }
}
