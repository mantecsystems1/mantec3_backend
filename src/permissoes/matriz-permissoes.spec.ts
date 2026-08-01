import { EVENTOS_NEGOCIO, listarEventosPermitidos, perfilPodeExecutarEvento } from './matriz-permissoes';

describe('matriz de permissoes por evento', () => {
  it('permite administrador executar qualquer evento critico', () => {
    expect(perfilPodeExecutarEvento('administrador', EVENTOS_NEGOCIO.OS_CANCELAR)).toBe(true);
    expect(perfilPodeExecutarEvento('admin', EVENTOS_NEGOCIO.NOTA_FISCAL_CANCELAR)).toBe(true);
  });

  it('permite tecnico atuar em OS, mas nao registrar pagamento', () => {
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.CLIENTE_EDITAR)).toBe(true);
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.OS_FINALIZAR)).toBe(true);
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.OS_RESERVAR_PECA)).toBe(true);
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR)).toBe(false);
  });

  it('permite financeiro registrar pagamento, mas nao consumir peca em OS', () => {
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.PAGAMENTO_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.VENDA_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.FORNECEDOR_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.LIVRO_CAIXA_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.CONTA_FINANCEIRA_GERENCIAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.CATEGORIA_FINANCEIRA_GERENCIAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.TITULO_FINANCEIRO_GERENCIAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.TITULO_FINANCEIRO_BAIXAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.TITULO_FINANCEIRO_ESTORNAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.RECORRENCIA_FINANCEIRA_PROCESSAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.PROLABORE_REGISTRAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.FECHAMENTO_MENSAL_GERENCIAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)).toBe(false);
  });

  it('permite estoquista consultar compras e fornecedores, mas nao financeiro administrativo', () => {
    expect(perfilPodeExecutarEvento('estoquista', EVENTOS_NEGOCIO.FORNECEDOR_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('estoquista', EVENTOS_NEGOCIO.COMPRA_PEDIDO_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('estoquista', EVENTOS_NEGOCIO.PAGAMENTO_CONSULTAR)).toBe(false);
    expect(perfilPodeExecutarEvento('estoquista', EVENTOS_NEGOCIO.LIVRO_CAIXA_CONSULTAR)).toBe(false);
    expect(perfilPodeExecutarEvento('estoquista', EVENTOS_NEGOCIO.TITULO_FINANCEIRO_CONSULTAR)).toBe(false);
  });

  it('permite fiscal consultar e emitir notas, mas nao acessar pagamentos', () => {
    expect(perfilPodeExecutarEvento('fiscal', EVENTOS_NEGOCIO.VENDA_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('fiscal', EVENTOS_NEGOCIO.NOTA_FISCAL_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('fiscal', EVENTOS_NEGOCIO.NOTA_FISCAL_EMITIR)).toBe(true);
    expect(perfilPodeExecutarEvento('fiscal', EVENTOS_NEGOCIO.PAGAMENTO_CONSULTAR)).toBe(false);
  });

  it('limita gestao de auditoria ao administrador', () => {
    expect(perfilPodeExecutarEvento('administrador', EVENTOS_NEGOCIO.AUDITORIA_GERENCIAR)).toBe(true);
    expect(perfilPodeExecutarEvento('gerente', EVENTOS_NEGOCIO.AUDITORIA_CONSULTAR)).toBe(true);
    expect(perfilPodeExecutarEvento('gerente', EVENTOS_NEGOCIO.AUDITORIA_GERENCIAR)).toBe(false);
  });

  it('nega perfil desconhecido', () => {
    expect(perfilPodeExecutarEvento('visitante', EVENTOS_NEGOCIO.ORCAMENTO_CRIAR)).toBe(false);
    expect(listarEventosPermitidos('visitante')).toEqual([]);
  });
});
