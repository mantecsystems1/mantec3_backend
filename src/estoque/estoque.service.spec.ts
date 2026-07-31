import { BadRequestException } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { MOVIMENTO_ESTOQUE_TIPO } from './movimento-estoque.types';

describe('EstoqueService', () => {
  const createService = (movimentos: Array<{ tipo: string; quantidade: number }>) => {
    const exec = jest.fn().mockResolvedValue(movimentos);
    const find = jest.fn().mockReturnValue({ exec });

    return new EstoqueService({ find } as never, {} as never, {} as never);
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
});
