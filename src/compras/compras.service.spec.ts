import { Types } from 'mongoose';
import { ComprasService } from './compras.service';
import { MOVIMENTO_ESTOQUE_ORIGEM } from '../estoque/movimento-estoque.types';

describe('ComprasService', () => {
  const createService = ({
    pedido,
    itens,
  }: {
    pedido?: Record<string, unknown>;
    itens?: Array<Record<string, unknown>>;
  }) => {
    const pedidoFindChain: any = {
      select: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    pedidoFindChain.select.mockReturnValue(pedidoFindChain);
    pedidoFindChain.lean.mockReturnValue(pedidoFindChain);

    const pedidosCompraModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(pedido ?? null),
        }),
      }),
      find: jest.fn().mockReturnValue(pedidoFindChain),
    };

    const itemFindChain: any = {
      lean: jest.fn(),
      populate: jest.fn(),
      exec: jest.fn().mockResolvedValue(itens ?? []),
    };
    itemFindChain.lean.mockReturnValue(itemFindChain);
    itemFindChain.populate.mockReturnValue(itemFindChain);

    const itensPedidoCompraModel = {
      find: jest.fn().mockReturnValue(itemFindChain),
    };

    const estoqueService = {
      sincronizarEntradasOrigem: jest.fn().mockResolvedValue([]),
      emTransacao: jest.fn((work: () => unknown) => work()),
    };

    const auditoriaService = {
      registrarEventoNegocio: jest.fn(),
    };

    const financeiroAdmService = {
      sincronizarTitulosPedidoCompra: jest.fn(),
      cancelarTitulosPorOrigem: jest.fn(),
    };

    const service = new ComprasService(
      {} as never,
      pedidosCompraModel as never,
      itensPedidoCompraModel as never,
      estoqueService as never,
      auditoriaService as never,
      financeiroAdmService as never,
    );

    return {
      service,
      pedidosCompraModel,
      itensPedidoCompraModel,
      estoqueService,
      pedidoFindChain,
      itemFindChain,
    };
  };

  it('gera entrada de estoque para cada item quando pedido e recebido', async () => {
    const pedidoCompraId = new Types.ObjectId().toString();
    const empresaId = new Types.ObjectId();
    const produtoId = new Types.ObjectId();
    const { service, estoqueService } = createService({
      pedido: { _id: pedidoCompraId, empresaId },
      itens: [{ produtoId, quantidade: 3 }],
    });

    await (service as unknown as { sincronizarEntradaEstoquePedido: (id: string, status: string) => Promise<void> })
      .sincronizarEntradaEstoquePedido(pedidoCompraId, 'recebido');

    expect(estoqueService.sincronizarEntradasOrigem).toHaveBeenCalledWith(
      empresaId.toString(), MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA, pedidoCompraId,
      [{ produtoId: produtoId.toString(), quantidade: 3 }],
    );
  });

  it('estorna entradas antigas sem apagar historico quando pedido deixa de recebido', async () => {
    const pedidoCompraId = new Types.ObjectId().toString();
    const empresaId = new Types.ObjectId();
    const { service, estoqueService, itensPedidoCompraModel } = createService({ pedido: { _id: pedidoCompraId, empresaId } });
    await (service as unknown as { sincronizarEntradaEstoquePedido: (id: string, status: string) => Promise<void> })
      .sincronizarEntradaEstoquePedido(pedidoCompraId, 'cancelado');
    expect(estoqueService.sincronizarEntradasOrigem).toHaveBeenCalledWith(
      empresaId.toString(), MOVIMENTO_ESTOQUE_ORIGEM.PEDIDO_COMPRA, pedidoCompraId, [],
    );
    expect(itensPedidoCompraModel.find).not.toHaveBeenCalled();
  });

  it('filtra itens de pedido de compra pela empresa do usuario', async () => {
    const empresaId = new Types.ObjectId().toString();
    const pedidoId = new Types.ObjectId();
    const { service, pedidosCompraModel, itensPedidoCompraModel, pedidoFindChain } = createService({});
    pedidoFindChain.exec.mockResolvedValue([{ _id: pedidoId }]);

    await service.findAllItensPedidoCompra(empresaId);

    expect(pedidosCompraModel.find).toHaveBeenCalledWith({ empresaId });
    expect(pedidoFindChain.select).toHaveBeenCalledWith('_id');
    expect(itensPedidoCompraModel.find).toHaveBeenCalledWith({
      pedidoCompraId: { $in: [pedidoId] },
    });
  });
});
