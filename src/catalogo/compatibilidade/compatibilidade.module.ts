import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompatibilidadeService } from './compatibilidade.service';
import { CompatibilidadeController } from './compatibilidade.controller';
import {
  CompatibilidadeProduto,
  CompatibilidadeProdutoSchema,
} from './schemas/compatibilidade-produto.schema';
import { Produto, ProdutoSchema } from '../produtos/schemas/produto.schema';
import { MovimentosEstoque, MovimentosEstoqueSchema } from '../../estoque/schemas/movimento-estoque.schema';
import { OrdemServico, OrdemServicoSchema } from '../../ordens-servico/schemas/ordem-servico.schema';
import {
  RecebimentoEquipamento,
  RecebimentoEquipamentoSchema,
} from '../../recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { AparelhoModelo, AparelhoModeloSchema } from './schemas/aparelho-modelo.schema';
import { CompatibilidadeModelo, CompatibilidadeModeloSchema } from './schemas/compatibilidade-modelo.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CompatibilidadeProduto.name, schema: CompatibilidadeProdutoSchema },
      { name: AparelhoModelo.name, schema: AparelhoModeloSchema },
      { name: CompatibilidadeModelo.name, schema: CompatibilidadeModeloSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: MovimentosEstoque.name, schema: MovimentosEstoqueSchema },
      { name: OrdemServico.name, schema: OrdemServicoSchema },
      { name: RecebimentoEquipamento.name, schema: RecebimentoEquipamentoSchema },
    ]),
  ],
  controllers: [CompatibilidadeController],
  providers: [CompatibilidadeService],
  exports: [CompatibilidadeService],
})
export class CompatibilidadeModule {}
