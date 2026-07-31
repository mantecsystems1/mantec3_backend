import {
  MOVIMENTO_ESTOQUE_TIPO,
  calcularDisponibilidadeMovimentos,
  calcularSaldoMovimentos,
  getMovimentoEstoqueSinal,
  isMovimentoEstoqueTipo,
} from './movimento-estoque.types';

describe('movimento estoque types', () => {
  it('reconhece tipos oficiais', () => {
    expect(isMovimentoEstoqueTipo(MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA)).toBe(true);
    expect(isMovimentoEstoqueTipo('tipo_inexistente')).toBe(false);
  });

  it('define sinais de entrada e saida', () => {
    expect(getMovimentoEstoqueSinal(MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA)).toBe(1);
    expect(getMovimentoEstoqueSinal(MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS)).toBe(-1);
    expect(getMovimentoEstoqueSinal(MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS)).toBe(-1);
    expect(getMovimentoEstoqueSinal(MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA)).toBe(1);
    expect(getMovimentoEstoqueSinal(MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS)).toBe(1);
  });

  it('calcula saldo pela soma dos movimentos', () => {
    const saldo = calcularSaldoMovimentos([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 10 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS, quantidade: 2 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS, quantidade: 3 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA, quantidade: 1 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS, quantidade: 1 },
    ]);

    expect(saldo).toBe(7);
  });

  it('calcula disponibilidade separando fisico, reservado e disponivel', () => {
    const disponibilidade = calcularDisponibilidadeMovimentos([
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA, quantidade: 10 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS, quantidade: 3 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS, quantidade: 2 },
      { tipo: MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA, quantidade: 1 },
    ]);

    expect(disponibilidade).toEqual({
      saldoFisico: 8,
      reservado: 2,
      disponivel: 6,
    });
  });
});
