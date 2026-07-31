export const PERFIS_SISTEMA = {
  ADMINISTRADOR: 'administrador',
  GERENTE: 'gerente',
  ATENDENTE: 'atendente',
  TECNICO: 'tecnico',
  ESTOQUISTA: 'estoquista',
  FINANCEIRO: 'financeiro',
  FISCAL: 'fiscal',
} as const;

export type PerfilSistema = (typeof PERFIS_SISTEMA)[keyof typeof PERFIS_SISTEMA];

export const EVENTOS_NEGOCIO = {
  RECEBIMENTO_CRIAR: 'recebimento.criar',
  RECEBIMENTO_GERAR_TERMO: 'recebimento.gerar_termo',

  ORCAMENTO_CRIAR: 'orcamento.criar',
  ORCAMENTO_EDITAR_RASCUNHO: 'orcamento.editar_rascunho',
  ORCAMENTO_ENVIAR: 'orcamento.enviar',
  ORCAMENTO_APROVAR: 'orcamento.aprovar',
  ORCAMENTO_REPROVAR: 'orcamento.reprovar',
  ORCAMENTO_CANCELAR: 'orcamento.cancelar',

  OS_CRIAR: 'os.criar',
  OS_INICIAR_DIAGNOSTICO: 'os.iniciar_diagnostico',
  OS_AGUARDAR_PECA: 'os.aguardar_peca',
  OS_RESERVAR_PECA: 'os.reservar_peca',
  OS_INICIAR_EXECUCAO: 'os.iniciar_execucao',
  OS_CONSUMIR_PECA: 'os.consumir_peca',
  OS_FINALIZAR: 'os.finalizar',
  OS_CANCELAR: 'os.cancelar',

  ESTOQUE_ENTRADA: 'estoque.entrada',
  ESTOQUE_RESERVAR: 'estoque.reservar',
  ESTOQUE_BAIXAR: 'estoque.baixar',
  ESTOQUE_AJUSTAR: 'estoque.ajustar',
  ESTOQUE_ESTORNAR: 'estoque.estornar',

  VENDA_GERAR: 'venda.gerar',
  VENDA_CANCELAR: 'venda.cancelar',
  PAGAMENTO_REGISTRAR: 'pagamento.registrar',
  PAGAMENTO_ESTORNAR: 'pagamento.estornar',

  NOTA_FISCAL_EMITIR: 'nota_fiscal.emitir',
  NOTA_FISCAL_CANCELAR: 'nota_fiscal.cancelar',

  GARANTIA_ABRIR: 'garantia.abrir',
  GARANTIA_ENVIAR_FORNECEDOR: 'garantia.enviar_fornecedor',
  GARANTIA_REGISTRAR_RETORNO: 'garantia.registrar_retorno',
  GARANTIA_FINALIZAR: 'garantia.finalizar',

  AUDITORIA_CONSULTAR: 'auditoria.consultar',
} as const;

export type EventoNegocio = (typeof EVENTOS_NEGOCIO)[keyof typeof EVENTOS_NEGOCIO];

export const MATRIZ_PERMISSOES: Record<PerfilSistema, ReadonlySet<EventoNegocio>> = {
  [PERFIS_SISTEMA.ADMINISTRADOR]: new Set(Object.values(EVENTOS_NEGOCIO)),
  [PERFIS_SISTEMA.GERENTE]: new Set(Object.values(EVENTOS_NEGOCIO).filter(
    (evento) => evento !== EVENTOS_NEGOCIO.NOTA_FISCAL_CANCELAR,
  )),
  [PERFIS_SISTEMA.ATENDENTE]: new Set([
    EVENTOS_NEGOCIO.RECEBIMENTO_CRIAR,
    EVENTOS_NEGOCIO.RECEBIMENTO_GERAR_TERMO,
    EVENTOS_NEGOCIO.ORCAMENTO_CRIAR,
    EVENTOS_NEGOCIO.ORCAMENTO_EDITAR_RASCUNHO,
    EVENTOS_NEGOCIO.ORCAMENTO_ENVIAR,
    EVENTOS_NEGOCIO.ORCAMENTO_REPROVAR,
    EVENTOS_NEGOCIO.OS_CRIAR,
    EVENTOS_NEGOCIO.OS_RESERVAR_PECA,
    EVENTOS_NEGOCIO.GARANTIA_ABRIR,
  ]),
  [PERFIS_SISTEMA.TECNICO]: new Set([
    EVENTOS_NEGOCIO.OS_CRIAR,
    EVENTOS_NEGOCIO.OS_INICIAR_DIAGNOSTICO,
    EVENTOS_NEGOCIO.OS_AGUARDAR_PECA,
    EVENTOS_NEGOCIO.OS_RESERVAR_PECA,
    EVENTOS_NEGOCIO.OS_INICIAR_EXECUCAO,
    EVENTOS_NEGOCIO.OS_CONSUMIR_PECA,
    EVENTOS_NEGOCIO.OS_FINALIZAR,
    EVENTOS_NEGOCIO.GARANTIA_REGISTRAR_RETORNO,
  ]),
  [PERFIS_SISTEMA.ESTOQUISTA]: new Set([
    EVENTOS_NEGOCIO.ESTOQUE_ENTRADA,
    EVENTOS_NEGOCIO.ESTOQUE_RESERVAR,
    EVENTOS_NEGOCIO.ESTOQUE_BAIXAR,
    EVENTOS_NEGOCIO.ESTOQUE_AJUSTAR,
    EVENTOS_NEGOCIO.ESTOQUE_ESTORNAR,
    EVENTOS_NEGOCIO.GARANTIA_ENVIAR_FORNECEDOR,
  ]),
  [PERFIS_SISTEMA.FINANCEIRO]: new Set([
    EVENTOS_NEGOCIO.VENDA_GERAR,
    EVENTOS_NEGOCIO.VENDA_CANCELAR,
    EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR,
    EVENTOS_NEGOCIO.PAGAMENTO_ESTORNAR,
  ]),
  [PERFIS_SISTEMA.FISCAL]: new Set([
    EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR,
    EVENTOS_NEGOCIO.NOTA_FISCAL_CANCELAR,
  ]),
};

export function normalizarPerfil(perfil: string): PerfilSistema | null {
  const normalized = perfil.trim().toLowerCase();
  const aliases: Record<string, PerfilSistema> = {
    admin: PERFIS_SISTEMA.ADMINISTRADOR,
    administrador: PERFIS_SISTEMA.ADMINISTRADOR,
    gerente: PERFIS_SISTEMA.GERENTE,
    atendente: PERFIS_SISTEMA.ATENDENTE,
    tecnico: PERFIS_SISTEMA.TECNICO,
    tecnico_assistencia: PERFIS_SISTEMA.TECNICO,
    estoquista: PERFIS_SISTEMA.ESTOQUISTA,
    financeiro: PERFIS_SISTEMA.FINANCEIRO,
    fiscal: PERFIS_SISTEMA.FISCAL,
  };

  return aliases[normalized] ?? null;
}

export function perfilPodeExecutarEvento(perfil: string, evento: EventoNegocio): boolean {
  const perfilNormalizado = normalizarPerfil(perfil);
  if (!perfilNormalizado) {
    return false;
  }

  return MATRIZ_PERMISSOES[perfilNormalizado].has(evento);
}

export function listarEventosPermitidos(perfil: string): EventoNegocio[] {
  const perfilNormalizado = normalizarPerfil(perfil);
  if (!perfilNormalizado) {
    return [];
  }

  return Array.from(MATRIZ_PERMISSOES[perfilNormalizado]);
}
