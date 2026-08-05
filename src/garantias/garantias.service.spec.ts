import { BadRequestException } from '@nestjs/common';
import { GarantiasService } from './garantias.service';
import { GARANTIA_STATUS } from './state/garantia.states';

describe('GarantiasService', () => {
  const createService = () => {
    const save = jest.fn();
    const garantiaModel = jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save,
    }));

    const itensPedidoCompraModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const service = new GarantiasService(
      garantiaModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      itensPedidoCompraModel as never,
      { registrarEventoNegocio: jest.fn() } as never,
    );

    return { service, garantiaModel, save, itensPedidoCompraModel };
  };

  const payload = {
    empresaId: 'empresa-1',
    clienteId: 'cliente-1',
    vendaId: 'venda-1',
    produtoId: 'produto-1',
    fornecedorId: 'fornecedor-1',
    quantidade: 1,
    motivo: 'Produto com defeito em homologacao',
    status: GARANTIA_STATUS.ABERTA,
  };

  it('cadastra garantia quando fornecedor e informado manualmente', async () => {
    const { service, garantiaModel, save, itensPedidoCompraModel } = createService();
    save.mockResolvedValue({ _id: 'garantia-1', ...payload });

    const result = await service.createGarantia(payload);

    expect(garantiaModel).toHaveBeenCalledWith(payload);
    expect(itensPedidoCompraModel.find).not.toHaveBeenCalled();
    expect(result).toEqual({ _id: 'garantia-1', ...payload });
  });

  it('retorna erro claro quando fornecedor nao foi informado nem inferido', async () => {
    const { service, save } = createService();
    const { fornecedorId: _fornecedorId, ...payloadSemFornecedor } = payload;

    await expect(service.createGarantia(payloadSemFornecedor)).rejects.toThrow(BadRequestException);
    await expect(service.createGarantia(payloadSemFornecedor)).rejects.toThrow(
      'Fornecedor nao informado e nao foi possivel inferir pelo historico de compras do produto.',
    );
    expect(save).not.toHaveBeenCalled();
  });
});
