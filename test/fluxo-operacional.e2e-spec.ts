import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthTokenGuard } from '../src/common/guards/auth-token.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { EstoqueController } from '../src/estoque/estoque.controller';
import { EstoqueService } from '../src/estoque/estoque.service';
import { PagamentosController } from '../src/financeiro/pagamentos/pagamentos.controller';
import { PagamentosService } from '../src/financeiro/pagamentos/pagamentos.service';
import { VendasController } from '../src/financeiro/vendas/vendas.controller';
import { VendasService } from '../src/financeiro/vendas/vendas.service';
import { VENDA_STATUS_FINANCEIRO } from '../src/financeiro/vendas/venda-financeiro.states';
import { GarantiasController } from '../src/garantias/garantias.controller';
import { GarantiasService } from '../src/garantias/garantias.service';
import { GARANTIA_STATUS } from '../src/garantias/state/garantia.states';
import { OrcamentosController } from '../src/orcamentos/orcamentos.controller';
import { OrcamentosService } from '../src/orcamentos/orcamentos.service';
import { ORCAMENTO_STATUS } from '../src/orcamentos/state/orcamento.states';
import { OsController } from '../src/ordens-servico/os.controller';
import { OsService } from '../src/ordens-servico/os.service';
import { OS_STATUS } from '../src/ordens-servico/state/os.states';

describe('Fluxo operacional (e2e)', () => {
  let app: INestApplication<App>;

  const orcamentosService = {
    update: jest.fn(),
    createItem: jest.fn(),
    findItemsByOrcamento: jest.fn(),
  };

  const osService = {
    update: jest.fn(),
    reservarPeca: jest.fn(),
    consumirReserva: jest.fn(),
    findReservasByOs: jest.fn(),
    findItemsByOs: jest.fn(),
  };

  const estoqueService = {
    create: jest.fn(),
    getDisponibilidadeProduto: jest.fn(),
    getDisponibilidadeProdutos: jest.fn(),
  };

  const vendasService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createItem: jest.fn(),
    findAllItems: jest.fn(),
    findOneItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
  };

  const pagamentosService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const garantiasService = {
    createGarantia: jest.fn(),
    updateGarantia: jest.fn(),
    createEnvioGarantia: jest.fn(),
    createRetornoGarantia: jest.fn(),
    createCreditoFornecedor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    orcamentosService.update.mockImplementation((id: string, payload: Record<string, unknown>) => ({
      _id: id,
      ...payload,
    }));
    orcamentosService.createItem.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'item-orcamento-1',
      ...payload,
    }));
    orcamentosService.findItemsByOrcamento.mockResolvedValue([]);

    osService.update.mockImplementation((id: string, payload: Record<string, unknown>) => ({
      _id: id,
      ...payload,
    }));
    osService.reservarPeca.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'reserva-1',
      status: 'reservada',
      ...payload,
    }));
    osService.consumirReserva.mockImplementation((id: string) => ({
      _id: id,
      status: 'consumida',
    }));
    osService.findReservasByOs.mockResolvedValue([]);
    osService.findItemsByOs.mockResolvedValue([]);

    estoqueService.create.mockImplementation((payload: Record<string, unknown>, usuarioId?: string) => ({
      _id: 'movimento-1',
      criadoPor: usuarioId,
      ...payload,
    }));
    estoqueService.getDisponibilidadeProduto.mockImplementation((produtoId: string) => ({
      produtoId,
      saldoFisico: 5,
      reservado: 1,
      disponivel: 4,
    }));
    estoqueService.getDisponibilidadeProdutos.mockResolvedValue([]);

    vendasService.create.mockImplementation((payload: Record<string, unknown>, usuarioId?: string) => ({
      _id: 'venda-1',
      criadoPor: usuarioId,
      statusFinanceiro: VENDA_STATUS_FINANCEIRO.PENDENTE,
      ...payload,
    }));
    vendasService.createItem.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'item-venda-1',
      ...payload,
    }));

    pagamentosService.create.mockImplementation((payload: Record<string, unknown>, usuarioId?: string) => ({
      _id: 'pagamento-1',
      registradoPor: usuarioId,
      ...payload,
    }));

    garantiasService.createGarantia.mockImplementation((payload: Record<string, unknown>, usuarioId?: string) => ({
      _id: 'garantia-1',
      criadoPor: usuarioId,
      status: GARANTIA_STATUS.ABERTA,
      ...payload,
    }));
    garantiasService.updateGarantia.mockImplementation((id: string, payload: Record<string, unknown>, usuarioId?: string) => ({
      _id: id,
      atualizadoPor: usuarioId,
      ...payload,
    }));
    garantiasService.createEnvioGarantia.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'envio-garantia-1',
      ...payload,
    }));
    garantiasService.createRetornoGarantia.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'retorno-garantia-1',
      ...payload,
    }));
    garantiasService.createCreditoFornecedor.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'credito-fornecedor-1',
      ...payload,
    }));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        OrcamentosController,
        OsController,
        EstoqueController,
        VendasController,
        PagamentosController,
        GarantiasController,
      ],
      providers: [
        { provide: OrcamentosService, useValue: orcamentosService },
        { provide: OsService, useValue: osService },
        { provide: EstoqueService, useValue: estoqueService },
        { provide: VendasService, useValue: vendasService },
        { provide: PagamentosService, useValue: pagamentosService },
        { provide: GarantiasService, useValue: garantiasService },
      ],
    })
      .overrideGuard(AuthTokenGuard)
      .useValue({
        canActivate: (context) => {
          const requestContext = context.switchToHttp().getRequest();
          requestContext.user = {
            id: 'user-e2e',
            _id: 'user-e2e',
            sub: 'user-e2e',
            nome: 'Usuario E2E',
            email: 'usuario.e2e@mantec.local',
            empresaId: 'empresa-e2e',
            perfil: 'admin',
          };
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('executa contrato HTTP de orcamento aprovado para OS em execucao com reserva e consumo de peca', async () => {
    await request(app.getHttpServer())
      .post('/orcamentos/orc-1/enviar')
      .expect(201)
      .expect({ _id: 'orc-1', status: ORCAMENTO_STATUS.ENVIADO });

    await request(app.getHttpServer())
      .post('/orcamentos/orc-1/aprovar')
      .expect(201)
      .expect({ _id: 'orc-1', status: ORCAMENTO_STATUS.APROVADO });

    await request(app.getHttpServer())
      .post('/ordens-servico/os-1/iniciar-diagnostico')
      .expect(201)
      .expect({ _id: 'os-1', statusOperacional: OS_STATUS.EM_DIAGNOSTICO });

    await request(app.getHttpServer())
      .post('/ordens-servico/os-1/iniciar-execucao')
      .expect(201)
      .expect({ _id: 'os-1', statusOperacional: OS_STATUS.EM_EXECUCAO });

    await request(app.getHttpServer())
      .post('/ordens-servico/reservas-pecas')
      .send({ ordemServicoId: 'os-1', produtoId: 'produto-1', quantidade: 1 })
      .expect(201)
      .expect({
        _id: 'reserva-1',
        status: 'reservada',
        ordemServicoId: 'os-1',
        produtoId: 'produto-1',
        quantidade: 1,
      });

    await request(app.getHttpServer())
      .post('/ordens-servico/reservas-pecas/reserva-1/consumir')
      .expect(201)
      .expect({ _id: 'reserva-1', status: 'consumida' });

    await request(app.getHttpServer())
      .get('/estoque/disponibilidade/produto-1')
      .expect(200)
      .expect({
        produtoId: 'produto-1',
        saldoFisico: 5,
        reservado: 1,
        disponivel: 4,
      });

    expect(orcamentosService.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.ENVIADO });
    expect(orcamentosService.update).toHaveBeenCalledWith('orc-1', { status: ORCAMENTO_STATUS.APROVADO });
    expect(osService.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_DIAGNOSTICO });
    expect(osService.update).toHaveBeenCalledWith('os-1', { statusOperacional: OS_STATUS.EM_EXECUCAO });
    expect(osService.reservarPeca).toHaveBeenCalledWith({
      ordemServicoId: 'os-1',
      produtoId: 'produto-1',
      quantidade: 1,
    });
    expect(osService.consumirReserva).toHaveBeenCalledWith('reserva-1');
    expect(estoqueService.getDisponibilidadeProduto).toHaveBeenCalledWith('produto-1');
  });

  it('registra ajuste manual de estoque com usuario autenticado', async () => {
    await request(app.getHttpServer())
      .post('/estoque/movimentos')
      .send({
        produtoId: 'produto-1',
        tipo: 'ajuste_manual',
        quantidade: 3,
        origemTipo: 'ajuste_manual',
      })
      .expect(201)
      .expect({
        _id: 'movimento-1',
        criadoPor: 'user-e2e',
        produtoId: 'produto-1',
        tipo: 'ajuste_manual',
        quantidade: 3,
        origemTipo: 'ajuste_manual',
      });

    expect(estoqueService.create).toHaveBeenCalledWith(
      {
        produtoId: 'produto-1',
        tipo: 'ajuste_manual',
        quantidade: 3,
        origemTipo: 'ajuste_manual',
      },
      'user-e2e',
    );
  });

  it('executa contrato HTTP financeiro e garantia apos venda paga', async () => {
    await request(app.getHttpServer())
      .post('/vendas')
      .send({
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        total: '250.00',
      })
      .expect(201)
      .expect({
        _id: 'venda-1',
        criadoPor: 'user-e2e',
        statusFinanceiro: VENDA_STATUS_FINANCEIRO.PENDENTE,
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        total: '250.00',
      });

    await request(app.getHttpServer())
      .post('/vendas/itens')
      .send({
        vendaId: 'venda-1',
        tipo: 'produto',
        referenciaId: 'produto-1',
        quantidade: 1,
        valorUnitario: '250.00',
        totalItem: '250.00',
      })
      .expect(201)
      .expect({
        _id: 'item-venda-1',
        vendaId: 'venda-1',
        tipo: 'produto',
        referenciaId: 'produto-1',
        quantidade: 1,
        valorUnitario: '250.00',
        totalItem: '250.00',
      });

    await request(app.getHttpServer())
      .post('/pagamentos')
      .send({
        vendaId: 'venda-1',
        valor: '250.00',
        formaPagamento: 'pix',
      })
      .expect(201)
      .expect({
        _id: 'pagamento-1',
        registradoPor: 'user-e2e',
        vendaId: 'venda-1',
        valor: '250.00',
        formaPagamento: 'pix',
      });

    await request(app.getHttpServer())
      .post('/garantias')
      .send({
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        produtoId: 'produto-1',
        vendaId: 'venda-1',
        motivo: 'Defeito apresentado apos a venda',
      })
      .expect(201)
      .expect({
        _id: 'garantia-1',
        criadoPor: 'user-e2e',
        status: GARANTIA_STATUS.ABERTA,
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        produtoId: 'produto-1',
        vendaId: 'venda-1',
        motivo: 'Defeito apresentado apos a venda',
      });

    await request(app.getHttpServer())
      .post('/garantias/garantia-1/enviar-fornecedor')
      .expect(201)
      .expect({
        _id: 'garantia-1',
        atualizadoPor: 'user-e2e',
        status: GARANTIA_STATUS.ENVIADA_FORNECEDOR,
      });

    await request(app.getHttpServer())
      .post('/garantias/garantia-1/aprovar')
      .expect(201)
      .expect({
        _id: 'garantia-1',
        atualizadoPor: 'user-e2e',
        status: GARANTIA_STATUS.APROVADA,
      });

    await request(app.getHttpServer())
      .post('/garantias/garantia-1/finalizar')
      .expect(201)
      .expect({
        _id: 'garantia-1',
        atualizadoPor: 'user-e2e',
        status: GARANTIA_STATUS.CONCLUIDA,
      });

    expect(vendasService.create).toHaveBeenCalledWith(
      {
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        total: '250.00',
      },
      'user-e2e',
    );
    expect(vendasService.createItem).toHaveBeenCalledWith({
      vendaId: 'venda-1',
      tipo: 'produto',
      referenciaId: 'produto-1',
      quantidade: 1,
      valorUnitario: '250.00',
      totalItem: '250.00',
    });
    expect(pagamentosService.create).toHaveBeenCalledWith(
      {
        vendaId: 'venda-1',
        valor: '250.00',
        formaPagamento: 'pix',
      },
      'user-e2e',
    );
    expect(garantiasService.createGarantia).toHaveBeenCalledWith(
      {
        empresaId: 'empresa-e2e',
        clienteId: 'cliente-1',
        produtoId: 'produto-1',
        vendaId: 'venda-1',
        motivo: 'Defeito apresentado apos a venda',
      },
      'user-e2e',
    );
    expect(garantiasService.updateGarantia).toHaveBeenCalledWith(
      'garantia-1',
      { status: GARANTIA_STATUS.ENVIADA_FORNECEDOR },
      'user-e2e',
    );
    expect(garantiasService.updateGarantia).toHaveBeenCalledWith(
      'garantia-1',
      { status: GARANTIA_STATUS.APROVADA },
      'user-e2e',
    );
    expect(garantiasService.updateGarantia).toHaveBeenCalledWith(
      'garantia-1',
      { status: GARANTIA_STATUS.CONCLUIDA },
      'user-e2e',
    );
  });
});
