import { DocumentosService } from './documentos.service';

const query = (value: unknown) => ({ lean: () => ({ exec: async () => value }) });
describe('Documentos entregues ao cliente', () => {
  let service: DocumentosService;
  beforeEach(() => {
    const item = { tipo: 'servico', referenciaId: 'servico', quantidade: 1, valorUnitario: 100, totalItem: 100 };
    service = Object.assign(Object.create(DocumentosService.prototype), {
      empresaModel: { findById: () => query({ nomeFantasia: 'Empresa QA' }) },
      clienteModel: { findById: () => query({ nome: 'Cliente QA' }) },
      recebimentoModel: { findOne: () => query({ _id: 'entrada', empresaId: 'empresa', clienteId: 'cliente', marca: 'QA', modelo: 'Teste', tipoEquipamento: 'Celular' }) },
      termoModel: { findOne: () => query({ assinado: false }) },
      orcamentoModel: { findOne: () => query({ _id: 'orcamento', empresaId: 'empresa', clienteId: 'cliente', total: 100 }) },
      itensOrcamentoModel: { find: () => query([item]) },
      vendaModel: { findOne: () => query({ _id: 'venda', empresaId: 'empresa', clienteId: 'cliente', total: 100 }) },
      itensVendaModel: { find: () => query([item]) },
      pagamentoModel: { find: () => query([]) },
      servicoModel: { find: () => query([{ _id: 'servico', nome: 'Diagnostico completo QA' }]) },
    });
  });
  it('nao afirma aceite em termo nao assinado', async () => {
    const pdf = (await service.gerarTermoPdf('entrada', 'empresa')).toString('latin1');
    expect(pdf).toContain('ainda');
    expect(pdf).not.toContain('Aceite registrado');
  });
  it.each(['gerarOrcamentoPdf', 'gerarReciboPdf'] as const)('%s inclui descricao do servico', async method => {
    const pdf = (await service[method]('documento', 'empresa')).toString('latin1');
    expect(pdf).toContain('Diagnostico completo QA');
  });
});
