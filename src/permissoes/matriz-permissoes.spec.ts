import { EVENTOS_NEGOCIO, listarEventosPermitidos, perfilPodeExecutarEvento } from './matriz-permissoes';

describe('matriz de permissoes por evento', () => {
  it('permite administrador executar qualquer evento critico', () => {
    expect(perfilPodeExecutarEvento('administrador', EVENTOS_NEGOCIO.OS_CANCELAR)).toBe(true);
    expect(perfilPodeExecutarEvento('admin', EVENTOS_NEGOCIO.NOTA_FISCAL_CANCELAR)).toBe(true);
  });

  it('permite tecnico atuar em OS, mas nao registrar pagamento', () => {
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.OS_FINALIZAR)).toBe(true);
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.OS_RESERVAR_PECA)).toBe(true);
    expect(perfilPodeExecutarEvento('tecnico', EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR)).toBe(false);
  });

  it('permite financeiro registrar pagamento, mas nao consumir peca em OS', () => {
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.PAGAMENTO_REGISTRAR)).toBe(true);
    expect(perfilPodeExecutarEvento('financeiro', EVENTOS_NEGOCIO.OS_CONSUMIR_PECA)).toBe(false);
  });

  it('nega perfil desconhecido', () => {
    expect(perfilPodeExecutarEvento('visitante', EVENTOS_NEGOCIO.ORCAMENTO_CRIAR)).toBe(false);
    expect(listarEventosPermitidos('visitante')).toEqual([]);
  });
});
