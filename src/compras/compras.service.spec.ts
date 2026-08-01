import { Types } from 'mongoose';
import { ComprasService } from './compras.service';
import { MOVIMENTO_ESTOQUE_ORIGEM, MOVIMENTO_ESTOQUE_TIPO } from '../estoque/movimento-estoque.types';

describe('ComprasService', () => {
  const createService = ({
    pedido,
    itens,
  }: {
    pedido?: Record<string, unknown>;
    itens?: Array<Record<string, unknown>>;
  }) => {
    const pedidosCompraModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(pedido ?? null),
        }),
      }),
    };

    const itensPedidoCompraModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(itens ?? []),
        }),
      }),
    };

    const movimentosEstoqueModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      insertMany: jest.fn().mockResolvedValue([]),
    };

    const service = new ComprasService(
      {} as never,
      pedidosCompraModel as never,
      itensPedidoCompraModel as never,
      movimentosEstoqueModel as never,
    );

    return {
      service,
      pedidosCompraModel,
      itensPedidoCompraModel,
      movimentosEstoqueModel,
    };
  };

  it('gera entrada de estoque para cada item quando pedido e recebido', async () => {
    const pedidoCompraId = new Types.ObjectId().toString();
    const empresaId = new Types.ObjectId();
    const produtoId = new Types.ObjectId();
    const { service, movimentosEstoqueModel } = createService({
      pedido: { _id: pedidoCompraId, empresaId },
      itens: [{ produtoId, quantidade: 3 }],
    });

    await (service as unknown as { sincronizarEntradaEstoquePedido: (id: string, status: string) => Promise<void> })
      .sincronizarEntradaEstoquePedido(pedidoCompraId, 'recebido');

    expect(movimentosEstoqueModel.deleteMany).toHaveBeenCalledWith({
      tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
      origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA,
      origemId: new Types.ObjectId(pedidoCompraId),
    });
    expect(movimentosEstoqueModel.insertMany).toHaveBeenCalledWith([
      {
        empresaId,
        produtoId,
        tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA,
        quantidade: 3,
        origemTipo: MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA,
        origemId: new Types.ObjectId(pedidoCompraId),
      },
    ]);
  });

  it('remove entradas antigas e nao gera movimento quando pedido nao esta recebido', async () => {
    const pedidoCompraId = new Types.ObjectId().toString();
    const { service, movimentosEstoqueModel, pedidosCompraModel, itensPedidoCompraModel } = createService({});

    await (service as unknown as { sincronizarEntradaEstoquePedido: (id: string, status: string) => Promise<void> })
      .sincronizarEntradaEstoquePedido(pedidoCompraId, 'cancelado');

    expect(movimentosEstoqueModel.deleteMany).toHaveBeenCalled();
    expect(pedidosCompraModel.findById).not.toHaveBeenCalled();
    expect(itensPedidoCompraModel.find).not.toHaveBeenCalled();
    expect(movimentosEstoqueModel.insertMany).not.toHaveBeenCalled();
  });
});
