import { BadRequestException } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { MOVIMENTO_ESTOQUE_TIPO } from './movimento-estoque.types';

describe('EstoqueService', () => {
  const createService = (movimentos: Array<{ tipo: string; quantidade: number }>) => {
    const exec = jest.fn().mockResolvedValue(movimentos);
    const find = jest.fn().mockReturnValue({ exec });

    return new EstoqueService({ find } as never, {} as never, {} as never, {} as never);
  };

  const createServiceWithModel = (movimentos: Array<{ tipo: string; quantidade: number }>, saldoUpdateResult: unknown = { _id: 'saldo-1' }) => {
    const exec = jest.fn().mockResolvedValue(movimentos);
    const save = jest.fn().mockResolvedValue({ _id: 'movimento-1' });
    const model = jest.fn().mockImplementation((dto) => ({ ...dto, save }));
    const saldoModel = {
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'saldo-1' }) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(saldoUpdateResult) }),
    };
    const produtoModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ _id: 'produto-1' }),
          }),
        }),
      }),
    };
    Object.assign(model, {
      find: jest.fn().mockReturnValue({ exec }),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    });

    return { service: new EstoqueService(model as never, saldoModel as never, produtoModel as never, {} as never), save, saldoModel };
  };

  it('permite operacao quando ha saldo disponivel', async () => {
    const service = createService([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 5 },
    ]);

    await expect(service.assertSaldoDisponivel('produto-1', 3)).resolves.toBe(5);
  });

  it('bloqueia operacao quando saldo e insuficiente', async () => {
    const service = createService([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 2 },
    ]);

    await expect(service.assertSaldoDisponivel('produto-1', 3)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('considera saldo adicional sem gravar movimento antes da validacao', async () => {
    const service = createService([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 2 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS, quantidade: 2 },
    ]);

    await expect(service.assertSaldoDisponivel('produto-1', 2, 2)).resolves.toBe(2);
  });

  it('bloqueia movimento manual que deixaria estoque negativo', async () => {
    const { service, save, saldoModel } = createServiceWithModel([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 2 },
    ], null);

    await expect(service.create({
      produtoId: 'produto-1',
      empresaId: 'empresa-1',
      tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA,
      quantidade: 3,
    } as never, 'user-1', 'empresa-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
    expect(saldoModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        produtoId: 'produto-1',
        saldoFisico: { $gte: 3 },
        disponivel: { $gte: 3 },
      }),
      { $inc: { saldoFisico: -3, disponivel: -3 } },
      { new: true },
    );
  });
});
