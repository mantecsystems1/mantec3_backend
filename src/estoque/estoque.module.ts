import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EstoqueService } from './estoque.service';
import { EstoqueController } from './estoque.controller';
import { MovimentosEstoque, MovimentosEstoqueSchema } from './schemas/movimento-estoque.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Produto, ProdutoSchema } from '../catalogo/produtos/schemas/produto.schema';

@Module({
  imports: [
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: MovimentosEstoque.name, schema: MovimentosEstoqueSchema },
      { name: Produto.name, schema: ProdutoSchema },
    ]),
  ],
  controllers: [EstoqueController],
  providers: [EstoqueService],
  exports: [EstoqueService],
})
export class EstoqueModule {}
