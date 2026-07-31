export const MOVIMENTO_ESTOQUE_TIPO = {
  ENTRADA: 'entrada',
  SAIDA: 'saida',
  ENTRADA_COMPRA: 'entrada_compra',
  RESERVA_OS: 'reserva_os',
  SAIDA_OS: 'saida_os',
  ESTORNO_RESERVA: 'estorno_reserva',
  ESTORNO_OS: 'estorno_os',
  AJUSTE_MANUAL: 'ajuste_manual',
  PERDA: 'perda',
  TROCA_GARANTIA: 'troca_garantia',
} as const;

export type MovimentoEstoqueTipo = (typeof MOVIMENTO_ESTOQUE_TIPO)[keyof typeof MOVIMENTO_ESTOQUE_TIPO];

export const MOVIMENTO_ESTOQUE_ORIGEM = {
  PEDIDO_COMPRA: 'pedido_compra',
  ORDEM_SERVICO: 'ordem_servico',
  AJUSTE_MANUAL: 'ajuste_manual',
  GARANTIA: 'garantia',
} as const;

export type MovimentoEstoqueOrigem = (typeof MOVIMENTO_ESTOQUE_ORIGEM)[keyof typeof MOVIMENTO_ESTOQUE_ORIGEM];

export interface MovimentoEstoqueCalculavel {
  tipo: string;
  quantidade: number;
}

export interface DisponibilidadeEstoque {
  saldoFisico: number;
  reservado: number;
  disponivel: number;
}

export function isMovimentoEstoqueTipo(tipo: string): tipo is MovimentoEstoqueTipo {
  return Object.values(MOVIMENTO_ESTOQUE_TIPO).includes(tipo as MovimentoEstoqueTipo);
}

export function getMovimentoEstoqueSinal(tipo: string): 1 | -1 {
  switch (tipo) {
    case MOVIMENTO_ESTOQUE_TIPO.ENTRADA:
    case MOVIMENTO_ESTOQUE_TIPO.ENTRADA_COMPRA:
    case MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA:
    case MOVIMENTO_ESTOQUE_TIPO.ESTORNO_OS:
    case MOVIMENTO_ESTOQUE_TIPO.TROCA_GARANTIA:
      return 1;
    case MOVIMENTO_ESTOQUE_TIPO.SAIDA:
    case MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS:
    case MOVIMENTO_ESTOQUE_TIPO.SAIDA_OS:
    case MOVIMENTO_ESTOQUE_TIPO.AJUSTE_MANUAL:
    case MOVIMENTO_ESTOQUE_TIPO.PERDA:
      return -1;
    default:
      return -1;
  }
}

export function calcularSaldoMovimentos(movimentos: MovimentoEstoqueCalculavel[]): number {
  return movimentos.reduce((saldo, movimento) => {
    return saldo + getMovimentoEstoqueSinal(movimento.tipo) * Number(movimento.quantidade || 0);
  }, 0);
}

export function calcularDisponibilidadeMovimentos(movimentos: MovimentoEstoqueCalculavel[]): DisponibilidadeEstoque {
  return movimentos.reduce(
    (totais, movimento) => {
      const quantidade = Number(movimento.quantidade || 0);

      if (movimento.tipo === MOVIMENTO_ESTOQUE_TIPO.RESERVA_OS) {
        return {
          ...totais,
          reservado: totais.reservado + quantidade,
          disponivel: totais.disponivel - quantidade,
        };
      }

      if (movimento.tipo === MOVIMENTO_ESTOQUE_TIPO.ESTORNO_RESERVA) {
        return {
          ...totais,
          reservado: totais.reservado - quantidade,
          disponivel: totais.disponivel + quantidade,
        };
      }

      const sinal = getMovimentoEstoqueSinal(movimento.tipo);
      return {
        saldoFisico: totais.saldoFisico + sinal * quantidade,
        reservado: totais.reservado,
        disponivel: totais.disponivel + sinal * quantidade,
      };
    },
    { saldoFisico: 0, reservado: 0, disponivel: 0 },
  );
}
