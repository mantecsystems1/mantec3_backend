import { PortalClienteService } from './portal-cliente.service';
describe('Decisao do cliente no portal', () => {
  const empresaId = '507f1f77bcf86cd799439011';
  const clienteId = '507f1f77bcf86cd799439012';
  const id = '507f1f77bcf86cd799439013';
  let service: PortalClienteService;
  const update = jest.fn();
  let orcamento: { status: string; validade: Date };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T01:00:00Z'));
    update.mockReset();
    orcamento = { status: 'enviado', validade: new Date('2026-09-20') };
    service = Object.assign(Object.create(PortalClienteService.prototype), {
      verifyToken: async () => ({ empresaId, clienteId }),
      orcamentoModel: { findOne: () => ({ exec: async () => orcamento }) },
      orcamentosService: { update },
    });
  });
  afterEach(() => jest.useRealTimers());
  it.each([['aprovar', 'aprovado'], ['reprovar', 'reprovado']] as const)('permite %s ate o fim do dia e transmite a empresa', async (decisao, status) => {
    await service.decidirOrcamento('token', id, decisao);
    expect(update).toHaveBeenCalledWith(id, { status }, empresaId);
  });
  it('expira com escopo da empresa', async () => {
    orcamento.validade = new Date('2026-09-19');
    await expect(service.decidirOrcamento('token', id, 'aprovar')).rejects.toThrow('expirado');
    expect(update).toHaveBeenCalledWith(id, { status: 'expirado' }, empresaId);
  });
});
