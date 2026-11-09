import { OsService } from './os.service';
import { CHECKLIST_QUALIDADE_BASE } from './checklist-qualidade';
describe('Data de conclusao da OS', () => {
  it('registra o instante real ao concluir o servico', async () => {
    const exec = jest.fn().mockResolvedValue({});
    const recebimentoId = '650000000000000000000001';
    const empresaId = '650000000000000000000002';
    const model = {
      db: {
        transaction: (work: () => Promise<unknown>) => work(),
        model: () => ({ findOneAndUpdate: () => ({ lean: () => ({ exec: async () => ({ resultadoAtendimento: 'reparo', categoriaEquipamento: 'outro' }) }) }) }),
      },
      findOne: () => ({ exec: async () => ({
        statusOperacional: 'em_execucao',
        empresaId,
        tecnicoId: '650000000000000000000003',
        recebimentoEquipamentoId: recebimentoId,
        categoriaEquipamento: 'outro',
        checklistQualidade: CHECKLIST_QUALIDADE_BASE.map((codigo) => ({ codigo, resultado: 'aprovado' })),
      }) }),
      findOneAndUpdate: jest.fn(() => ({ exec })),
    };
    const service = new OsService(model as never, {} as never, {} as never, {} as never, { registrarEventoNegocio: jest.fn() } as never, {} as never);
    const before = Date.now();
    await service.update('650000000000000000000004', { statusOperacional: 'concluida' }, empresaId);
    const data = (model.findOneAndUpdate.mock.calls as unknown[][])[0][1] as { dataConclusao: Date };
    expect(data.dataConclusao.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.dataConclusao.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
