import { OsService } from './os.service';
describe('Data de conclusao da OS', () => {
  it('registra o instante real ao concluir o servico', async () => {
    const exec = jest.fn().mockResolvedValue({});
    const model = {
      findOne: () => ({ exec: async () => ({ statusOperacional: 'em_execucao', empresaId: 'empresa', tecnicoId: 'tecnico' }) }),
      findOneAndUpdate: jest.fn(() => ({ exec })),
    };
    const service = new OsService(model as never, {} as never, {} as never, {} as never, { registrarEventoNegocio: jest.fn() } as never, {} as never);
    const before = Date.now();
    await service.update('os', { statusOperacional: 'concluida' }, 'empresa');
    const data = (model.findOneAndUpdate.mock.calls as unknown[][])[0][1] as { dataConclusao: Date };
    expect(data.dataConclusao.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.dataConclusao.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
