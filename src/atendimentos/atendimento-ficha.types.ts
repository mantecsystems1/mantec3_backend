export type EstadoSecaoFicha = 'disponivel' | 'sem_acesso' | 'indisponivel';
export type SecaoFicha<T> = { estado: 'disponivel'; itens: T[] }
  | { estado: 'sem_acesso' | 'indisponivel'; mensagem: string };
export interface EixoAtendimento { codigo: string; label: string; descricao?: string }
export interface AcaoFicha { id: string; label: string; href: string; evento: string }
export interface PendenciaFicha { codigo: string; label: string; descricao: string; responsavel: string; acaoId?: string }
export interface ProximaAcaoFicha { label: string; descricao: string; responsavel: string; acaoId?: string }
export interface OrcamentoFicha {
  id: string; referencia: string; referenciaLegada: boolean; status: string; statusLabel: string;
  validade?: string; total: number; criadoEm?: string;
}
export interface OrdemFicha {
  id: string; referencia: string; referenciaLegada: boolean; status: string; statusLabel: string;
  prioridade: string; prioridadeLabel: string; tecnico?: string;
  dataEntrada?: string; dataConclusao?: string; dataEntrega?: string;
}
export interface VendaFicha {
  id: string; referencia: string; referenciaLegada: boolean; status: string; statusLabel: string;
  total: number; totalPago: number; saldoRestante: number;
}
export interface EventoFicha { id: string; data?: string; titulo: string; ator?: string; dominio: string }
export interface AtendimentoFicha {
  id: string; referencia: string; referenciaLegada: boolean; atualizadoEm: string;
  recebimento: {
    id: string; dataRecebimento?: string; status: string; statusLabel: string; estadoSalvamento?: string;
    resultadoAtendimento?: string; motivoSemReparo?: string; statusDevolucao?: string; devolucaoEm?: string; devolvidoParaNome?: string;
    devolucaoParaTipo?: string; devolucaoAutorizacaoTerceiroConfirmada?: boolean;
  };
  cliente: { estado: 'disponivel'; dados: { id: string; nome: string; telefone?: string } }
    | { estado: 'sem_acesso' | 'indisponivel'; mensagem: string };
  equipamento: { categoria?: string; tipo: string; marca: string; modelo: string; imeiOuSerial?: string };
  responsaveis: { papel: string; nome: string }[];
  etapas: { entrada: EixoAtendimento; orcamento: EixoAtendimento; tecnico: EixoAtendimento; financeiro: EixoAtendimento; entrega: EixoAtendimento };
  orcamentos: SecaoFicha<OrcamentoFicha>;
  ordensServico: SecaoFicha<OrdemFicha>;
  financeiro: SecaoFicha<VendaFicha>;
  linhaTempo: SecaoFicha<EventoFicha>;
  acoesPermitidas: AcaoFicha[];
  proximaAcao: ProximaAcaoFicha;
  pendencias: PendenciaFicha[];
}
