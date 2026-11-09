import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import mongoose, { type Connection, type Schema, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { AtendimentosController } from '../src/atendimentos/atendimentos.controller';
import { AtendimentosService } from '../src/atendimentos/atendimentos.service';
import type { AtendimentoFicha, SecaoFicha } from '../src/atendimentos/atendimento-ficha.types';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { RecebimentoEquipamento, RecebimentoEquipamentoSchema } from '../src/recebimento/recebimento-equipamento/recebimento-equipamento.schema';
import { Cliente, ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { Usuario, UsuarioSchema } from '../src/usuarios/schemas/usuario.schema';
import { Orcamento, OrcamentoSchema } from '../src/orcamentos/schemas/orcamento.schema';
import { OrdemServico, OrdemServicoSchema } from '../src/ordens-servico/schemas/ordem-servico.schema';
import { Venda, VendaSchema } from '../src/financeiro/vendas/schemas/venda.schema';
import { Pagamento, PagamentoSchema } from '../src/financeiro/pagamentos/schemas/pagamento.schema';
import { MovimentoCaixa, MovimentoCaixaSchema } from '../src/financeiro/financeiro-adm/schemas/movimento-caixa.schema';
import { LogEvento, LogEventoSchema } from '../src/auditoria/schemas/log-evento.schema';
import { perfilPodeExecutarEvento, type EventoNegocio } from '../src/permissoes/matriz-permissoes';

describe('Ficha interna: HTTP com guarda real, isolamento e projeção em Mongo descartável', { timeout: 120000 }, () => {
  let db: Connection, server: MongoMemoryReplSet, app: INestApplication;
  const empresaA = new Types.ObjectId(), empresaB = new Types.ObjectId();
  const operadorA = new Types.ObjectId(), operadorB = new Types.ObjectId();
  const itens = <T>(section: SecaoFicha<T>): T[] => {
    if (section.estado !== 'disponivel') assert.fail(`Seção não disponível: ${section.estado}`);
    return section.itens;
  };
  const consulta = async (id: unknown, perfil = 'admin_empresa', empresa = 'a') => {
    const response = await request(app.getHttpServer()).get(`/atendimentos/${id}`).set('x-test-profile', perfil).set('x-test-empresa', empresa).expect(200);
    return response.body as AtendimentoFicha;
  };
  const entrada = async (empresaId = empresaA, recebidoPor = operadorA) => {
    const cliente = await db.model(Cliente.name).create({ empresaId, nome: `Cliente ${new Types.ObjectId()}`, cpfCnpj: `DOCUMENTO-${new Types.ObjectId()}`, telefone: '11999990000', email: 'PRIVADO@exemplo.invalid' });
    const recebimento = await db.model(RecebimentoEquipamento.name).create({ empresaId, clienteId: cliente._id, recebidoPor, tipoEquipamento: 'Celular', marca: 'Teste', modelo: 'Modelo QA', dataRecebimento: new Date(), status: 'recebido', operacaoHash: 'HASH_PRIVADO', observacoesGerais: 'SEGREDO_OBSERVACAO', estadoSalvamento: 'confirmado' });
    return { cliente, recebimento };
  };
  type Entrada = Awaited<ReturnType<typeof entrada>>;
  const ordem = async (fixture: Entrada, statusOperacional = 'concluida', extra: Record<string, unknown> = {}) => db.model(OrdemServico.name).create({ empresaId: fixture.recebimento.empresaId, clienteId: fixture.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, tecnicoId: operadorA, statusOperacional, prioridade: 'normal', dataEntrada: new Date(), ...(statusOperacional === 'concluida' ? { dataConclusao: new Date() } : {}), assinaturaEntregaImagemBase64: 'ASSINATURA_PRIVADA', entregueParaDocumento: 'DOCUMENTO_RETIRADA_PRIVADO', ...extra });
  const venda = async (fixture: Entrada, osId: unknown) => db.model(Venda.name).create({ empresaId: fixture.recebimento.empresaId, clienteId: fixture.cliente._id, origemTipo: 'ordem_servico', origemId: osId, subtotal: '100', total: '100', statusFinanceiro: 'pago' });
  const evento = (entidade: string, entidadeId: unknown, tipoEvento: string, empresaId = empresaA, usuarioId = operadorA) => db.model(LogEvento.name).create({ empresaId, usuarioId, entidade, entidadeId, tipoEvento, dados: { valor: 987654321, token: 'TOKEN_AUDITORIA_PRIVADO', nome: 'NOME_EXTERNO_PRIVADO' } });

  before(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    for (const [name, schema] of [
      [RecebimentoEquipamento.name, RecebimentoEquipamentoSchema], [Cliente.name, ClienteSchema], [Usuario.name, UsuarioSchema],
      [Orcamento.name, OrcamentoSchema], [OrdemServico.name, OrdemServicoSchema], [Venda.name, VendaSchema],
      [Pagamento.name, PagamentoSchema], [MovimentoCaixa.name, MovimentoCaixaSchema], [LogEvento.name, LogEventoSchema],
    ] as const) await db.model(name, schema as Schema).init();
    await db.model(Usuario.name).create([
      { _id: operadorA, empresaId: empresaA, nome: 'Operador A', email: 'operador-a@exemplo.invalid', senhaHash: 'SENHA_PRIVADA', perfil: 'tecnico' },
      { _id: operadorB, empresaId: empresaB, nome: 'OPERADOR_EXTERNO_PRIVADO', email: 'operador-b@exemplo.invalid', senhaHash: 'SENHA_PRIVADA', perfil: 'tecnico' },
    ]);
    const service = new AtendimentosService(db);
    const module = await Test.createTestingModule({ controllers: [AtendimentosController], providers: [{ provide: AtendimentosService, useValue: service }] }).compile();
    app = module.createNestApplication();
    // Only authentication is a fixture: the event guard below is the production PermissionGuard.
    app.use((req: { headers: Record<string, string>; user?: object }, _res: unknown, next: () => void) => {
      if (req.headers['x-test-profile']) req.user = { id: String(operadorA), empresaId: req.headers['x-test-empresa'] === 'sem' ? undefined : String(req.headers['x-test-empresa'] === 'b' ? empresaB : empresaA), perfil: req.headers['x-test-profile'], perfis: req.headers['x-test-extra-profile'] ? [req.headers['x-test-extra-profile']] : [] };
      next();
    });
    app.useGlobalGuards(new PermissionGuard(new Reflector()));
    await app.init();
  });
  after(async () => { await app?.close(); await db?.close(); await server?.stop(); });

  it('exige sessão, evento e empresa e não revela atendimento de outro tenant', async () => {
    const a = await entrada(), b = await entrada(empresaB, operadorB);
    await request(app.getHttpServer()).get(`/atendimentos/${a.recebimento._id}`).expect(401);
    await request(app.getHttpServer()).get(`/atendimentos/${a.recebimento._id}`).set('x-test-profile', 'financeiro').expect(403);
    await request(app.getHttpServer()).get(`/atendimentos/${a.recebimento._id}`).set('x-test-profile', 'admin_empresa').set('x-test-empresa', 'sem').expect(401);
    await request(app.getHttpServer()).get(`/atendimentos/${a.recebimento._id}`).set('x-test-profile', 'admin_empresa').set('x-test-empresa', 'b').expect(404);
    await request(app.getHttpServer()).get(`/atendimentos/${b.recebimento._id}`).set('x-test-profile', 'admin_empresa').expect(404);
    await request(app.getHttpServer()).get('/atendimentos/invalido').set('x-test-profile', 'admin_empresa').expect(400);
    assert.equal((await consulta(b.recebimento._id, 'tecnico', 'b')).id, String(b.recebimento._id));
  });

  it('retorna referência humana e próxima ação contextual sem alterar os registros', async () => {
    const fixture = await entrada();
    const before = await db.model(LogEvento.name).countDocuments();
    const ficha = await consulta(fixture.recebimento._id, 'atendente');
    assert.match(ficha.referencia, /^Ref\. [A-F0-9]{6}$/);
    assert.equal(ficha.referenciaLegada, true);
    assert.equal(ficha.cliente.estado, 'disponivel');
    assert.deepEqual(itens(ficha.orcamentos), []);
    assert.equal(ficha.proximaAcao.acaoId, 'preparar_orcamento');
    assert.equal(ficha.acoesPermitidas.find((a) => a.id === 'preparar_orcamento')?.href, `/orcamentos/novo?clienteId=${fixture.cliente._id}&recebimentoId=${fixture.recebimento._id}`);
    assert.equal(await db.model(Orcamento.name).countDocuments({ recebimentoEquipamentoId: fixture.recebimento._id }), 0);
    assert.equal(await db.model(LogEvento.name).countDocuments(), before);
    for (const acao of ficha.acoesPermitidas) {
      assert.ok(acao.href.startsWith('/') && !acao.href.startsWith('//'));
      assert.ok(perfilPodeExecutarEvento('atendente', acao.evento as EventoNegocio));
    }
    const json = JSON.stringify(ficha);
    for (const secret of ['DOCUMENTO-', 'PRIVADO@', 'HASH_PRIVADO', 'SEGREDO_OBSERVACAO', 'SENHA_PRIVADA']) assert.ok(!json.includes(secret));
  });

  it('técnico acompanha conclusão sem consultar finanças nem expor eventos ou links financeiros', async () => {
    const fixture = await entrada(), os = await ordem(fixture), sale = await venda(fixture, os._id);
    const payment = await db.model(Pagamento.name).create({ vendaId: sale._id, formaPagamento: 'pix', valor: '100', dataPagamento: new Date() });
    await evento('recebimento', fixture.recebimento._id, 'RECEBIMENTO_CRIADO');
    await evento('ordem_servico', os._id, 'OS_STATUS_ALTERADO');
    await evento('venda', sale._id, 'VENDA_GERADA');
    await evento('pagamento', payment._id, 'PAGAMENTO_REGISTRADO');
    const salesRead = mock.method(db.model(Venda.name), 'find', () => { throw new Error('Consulta financeira indevida'); });
    const paymentsRead = mock.method(db.model(Pagamento.name), 'find', () => { throw new Error('Consulta financeira indevida'); });
    const cashRead = mock.method(db.model(MovimentoCaixa.name), 'find', () => { throw new Error('Consulta financeira indevida'); });
    try {
      const ficha = await consulta(fixture.recebimento._id, 'tecnico');
      assert.equal(salesRead.mock.callCount(), 0); assert.equal(paymentsRead.mock.callCount(), 0); assert.equal(cashRead.mock.callCount(), 0);
      assert.equal(ficha.financeiro.estado, 'sem_acesso'); assert.ok(!('itens' in ficha.financeiro));
      assert.equal(ficha.etapas.tecnico.label, 'Serviço concluído'); assert.equal(ficha.etapas.entrega.codigo, 'na_assistencia');
      assert.equal(ficha.proximaAcao.responsavel, 'Financeiro');
      assert.ok(itens(ficha.linhaTempo).some((e) => e.titulo === 'Etapa técnica atualizada'));
      assert.ok(itens(ficha.linhaTempo).every((e) => !['venda', 'pagamento'].includes(e.dominio)));
      const json = JSON.stringify(ficha);
      for (const secret of [String(sale._id), String(payment._id), '987654321', 'TOKEN_AUDITORIA_PRIVADO', 'totalPago', 'ASSINATURA_PRIVADA', 'DOCUMENTO_RETIRADA_PRIVADO']) assert.ok(!json.includes(secret), secret);
      assert.ok(ficha.acoesPermitidas.every((a) => !a.href.includes('/financeiro')));
    } finally { salesRead.mock.restore(); paymentsRead.mock.restore(); cashRead.mock.restore(); }
  });

  it('financeiro é derivado de pagamentos válidos e mantém conclusão separada da retirada', async () => {
    const fixture = await entrada(), os = await ordem(fixture), sale = await venda(fixture, os._id);
    await db.model(Pagamento.name).create({ vendaId: sale._id, formaPagamento: 'dinheiro', valor: '40', dataPagamento: new Date() });
    for (const [empresaId, status] of [[empresaA, 'estornado'], [empresaB, 'confirmado']] as const) {
      const pagamentoId = new Types.ObjectId(), movimentoId = new Types.ObjectId();
      await db.model(Pagamento.name).create({ _id: pagamentoId, vendaId: sale._id, formaPagamento: 'pix', valor: '60', dataPagamento: new Date(), movimentoCaixaId: movimentoId });
      await db.model(MovimentoCaixa.name).collection.insertOne({ _id: movimentoId, empresaId, status, origemTipo: 'pagamento_venda', origemId: pagamentoId, valor: Types.Decimal128.fromString('60') });
    }
    const ficha = await consulta(fixture.recebimento._id);
    assert.deepEqual({ status: itens(ficha.financeiro)[0].status, pago: itens(ficha.financeiro)[0].totalPago, saldo: itens(ficha.financeiro)[0].saldoRestante }, { status: 'parcial', pago: 40, saldo: 60 });
    assert.equal(ficha.proximaAcao.acaoId, 'registrar_pagamento');
    assert.equal(ficha.acoesPermitidas.find((a) => a.id === 'registrar_pagamento')?.href, `/financeiro/pagamentos/novo?vendaId=${sale._id}`);
    assert.equal(ficha.etapas.entrega.codigo, 'na_assistencia');
    assert.equal((await db.model(Venda.name).findById(sale._id))?.get('statusFinanceiro'), 'pago');
    await db.model(Pagamento.name).create({ vendaId: sale._id, formaPagamento: 'pix', valor: '60', dataPagamento: new Date() });
    const pago = await consulta(fixture.recebimento._id);
    assert.equal(pago.proximaAcao.acaoId, 'registrar_retirada'); assert.equal(pago.etapas.entrega.codigo, 'na_assistencia');
    await db.model(OrdemServico.name).updateOne({ _id: os._id }, { $set: { dataEntrega: new Date() } });
    const entregue = await consulta(fixture.recebimento._id);
    assert.equal(entregue.etapas.entrega.codigo, 'entregue'); assert.equal(entregue.proximaAcao.label, 'Retirada registrada');
  });

  it('falha de consulta não vira seção vazia nem sugere criar duplicata', async () => {
    const fixture = await entrada();
    const quote = await db.model(Orcamento.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorA, status: 'aprovado', validade: new Date(), subtotal: '100', total: '100' });
    const os = await ordem(fixture, 'concluida', { orcamentoId: quote._id });
    const quoteRead = mock.method(db.model(Orcamento.name), 'find', () => { throw new Error('Falha parcial simulada'); });
    try {
      const ficha = await consulta(fixture.recebimento._id);
      assert.equal(ficha.orcamentos.estado, 'indisponivel'); assert.ok(!('itens' in ficha.orcamentos));
      assert.equal(ficha.ordensServico.estado, 'indisponivel'); assert.ok(!('itens' in ficha.ordensServico));
      assert.equal(ficha.proximaAcao.label, 'Verificar as consultas pendentes');
      assert.ok(!ficha.acoesPermitidas.some((a) => a.id === 'preparar_orcamento'));
      assert.ok(ficha.pendencias.some((p) => p.codigo === 'consulta_orcamentos'));
    } finally { quoteRead.mock.restore(); }
    await venda(fixture, os._id);
    const saleRead = mock.method(db.model(Venda.name), 'find', () => { throw new Error('Falha financeira simulada'); });
    try {
      const ficha = await consulta(fixture.recebimento._id);
      assert.equal(ficha.financeiro.estado, 'indisponivel'); assert.ok(!('itens' in ficha.financeiro));
      assert.ok(!ficha.acoesPermitidas.some((a) => a.id === 'gerar_venda' || a.id === 'registrar_retirada'));
      assert.equal(ficha.proximaAcao.responsavel, 'Financeiro');
    } finally { saleRead.mock.restore(); }
  });

  it('preserva centavos no saldo apresentado', async () => {
    const fixture = await entrada(), os = await ordem(fixture), sale = await venda(fixture, os._id);
    await db.model(Venda.name).updateOne({ _id: sale._id }, { $set: { subtotal: '100.10', total: '100.10' } });
    await db.model(Pagamento.name).create({ vendaId: sale._id, formaPagamento: 'pix', valor: '40.05', dataPagamento: new Date() });
    const financeiro = itens((await consulta(fixture.recebimento._id)).financeiro)[0];
    assert.equal(financeiro.total, 100.1); assert.equal(financeiro.totalPago, 40.05); assert.equal(financeiro.saldoRestante, 60.05);
  });

  it('mostra venda legada ligada ao orçamento sem sugerir nova venda ou quitação da ordem', async () => {
    const fixture = await entrada();
    const quote = await db.model(Orcamento.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorA, status: 'aprovado', validade: new Date(), subtotal: '100', total: '100' });
    const os = await ordem(fixture, 'concluida', { orcamentoId: quote._id });
    const legacy = await db.model(Venda.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, origemTipo: 'orcamento', origemId: quote._id, subtotal: '100', total: '100', statusFinanceiro: 'pago' });
    await db.model(Pagamento.name).create({ vendaId: legacy._id, formaPagamento: 'pix', valor: '100', dataPagamento: new Date() });
    await evento('venda', legacy._id, 'VENDA_GERADA');
    const ficha = await consulta(fixture.recebimento._id);
    assert.equal(itens(ficha.financeiro).length, 1); assert.equal(itens(ficha.financeiro)[0].id, String(legacy._id));
    assert.equal(itens(ficha.financeiro)[0].status, 'pago');
    assert.equal(ficha.etapas.financeiro.codigo, 'conferir_venda_orcamento');
    assert.equal(ficha.proximaAcao.label, 'Conferir a venda ligada ao orçamento');
    assert.equal(ficha.proximaAcao.acaoId, `ver_venda_${legacy._id}`);
    assert.ok(ficha.pendencias.some((p) => p.codigo === 'venda_origem_orcamento'));
    assert.ok(!ficha.acoesPermitidas.some((a) => ['gerar_venda', 'registrar_retirada'].includes(a.id)));
    assert.ok(itens(ficha.linhaTempo).some((e) => e.dominio === 'venda'));
    assert.equal(await db.model(Venda.name).countDocuments({ origemTipo: 'ordem_servico', origemId: os._id }), 0);
    // An explicit quote link is visible even before an OS exists; direct sales are not inferred by customer/id coincidence.
    await db.model(OrdemServico.name).deleteOne({ _id: os._id });
    await db.model(Venda.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, origemTipo: 'venda_direta', origemId: quote._id, subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    assert.deepEqual(itens((await consulta(fixture.recebimento._id)).financeiro).map((s) => s.id), [String(legacy._id)]);
  });

  it('venda de orçamento exige empresa, cliente e entrada coerentes', async () => {
    const fixture = await entrada(), external = await entrada(empresaB, operadorB);
    const quote = await db.model(Orcamento.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorA, status: 'aprovado', validade: new Date(), subtotal: '100', total: '100' });
    const externalQuote = await db.model(Orcamento.name).create({ empresaId: empresaB, clienteId: external.cliente._id, recebimentoEquipamentoId: external.recebimento._id, criadoPor: operadorB, status: 'aprovado', validade: new Date(), subtotal: '100', total: '100' });
    const foreignTenant = await db.model(Venda.name).create({ empresaId: empresaB, clienteId: external.cliente._id, origemTipo: 'orcamento', origemId: quote._id, subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    const foreignQuote = await db.model(Venda.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, origemTipo: 'orcamento', origemId: externalQuote._id, subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    const foreignCustomer = await db.model(Venda.name).create({ empresaId: empresaA, clienteId: external.cliente._id, origemTipo: 'orcamento', origemId: quote._id, subtotal: '100', total: '100', statusFinanceiro: 'pendente' });
    const ficha = await consulta(fixture.recebimento._id);
    assert.deepEqual(itens(ficha.financeiro), []);
    assert.ok(ficha.pendencias.some((p) => p.codigo === 'vinculos_inconsistentes'));
    assert.equal(ficha.proximaAcao.label, 'Revisar os vínculos do atendimento');
    for (const sale of [foreignTenant, foreignQuote, foreignCustomer]) assert.ok(!JSON.stringify(ficha).includes(String(sale._id)));
  });

  it('vínculos legados incoerentes não mostram cliente, técnico ou auditoria externos', async () => {
    const fixture = await entrada(), external = await entrada(empresaB, operadorB);
    const externalQuote = await db.model(Orcamento.name).create({ empresaId: empresaB, clienteId: external.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorB, status: 'aprovado', validade: new Date(), subtotal: '50', total: '50' });
    await db.model(Orcamento.name).create({ empresaId: empresaA, clienteId: external.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorB, status: 'aprovado', validade: new Date(), subtotal: '50', total: '50' });
    const os = await ordem(fixture, 'aberta', { orcamentoId: externalQuote._id, tecnicoId: operadorB });
    await evento('ordem_servico', os._id, 'OS_CRIADA', empresaB, operadorB);
    await evento('recebimento', fixture.recebimento._id, 'RECEBIMENTO_CRIADO', empresaB, operadorB);
    const ficha = await consulta(fixture.recebimento._id);
    assert.deepEqual(itens(ficha.orcamentos), []); assert.deepEqual(itens(ficha.ordensServico), []);
    assert.ok(ficha.pendencias.some((p) => p.codigo === 'vinculos_inconsistentes'));
    assert.equal(ficha.proximaAcao.label, 'Revisar os vínculos do atendimento');
    assert.ok(!ficha.acoesPermitidas.some((a) => a.id === 'preparar_orcamento'));
    for (const secret of [String(external.cliente._id), String(os._id), 'OPERADOR_EXTERNO_PRIVADO', 'NOME_EXTERNO_PRIVADO']) assert.ok(!JSON.stringify(ficha).includes(secret), secret);
    await db.model(RecebimentoEquipamento.name).updateOne({ _id: fixture.recebimento._id }, { $set: { clienteId: external.cliente._id, recebidoPor: operadorB } });
    const badCustomer = await consulta(fixture.recebimento._id);
    assert.equal(badCustomer.cliente.estado, 'indisponivel'); assert.ok(!('dados' in badCustomer.cliente));
    assert.deepEqual(badCustomer.responsaveis, []);
    assert.ok(badCustomer.pendencias.some((p) => p.codigo === 'vinculos_inconsistentes'));
  });

  it('oculta técnico externo e venda de cliente divergente, sinalizando revisão sem nomes', async () => {
    const fixture = await entrada(), external = await entrada(empresaB, operadorB);
    const os = await ordem(fixture, 'concluida', { tecnicoId: operadorB });
    const sale = await venda(fixture, os._id);
    await db.model(Venda.name).updateOne({ _id: sale._id }, { $set: { clienteId: external.cliente._id } });
    const ficha = await consulta(fixture.recebimento._id);
    assert.equal(itens(ficha.ordensServico)[0].tecnico, undefined); assert.deepEqual(itens(ficha.financeiro), []);
    assert.equal(ficha.proximaAcao.label, 'Revisar os vínculos do atendimento');
    assert.ok(!JSON.stringify(ficha).includes('OPERADOR_EXTERNO_PRIVADO'));
    assert.ok(!ficha.acoesPermitidas.some((a) => a.id === 'gerar_venda'));
  });

  it('linha do tempo tem títulos e atores autorizados, sem dados brutos, e distingue falha', async () => {
    const fixture = await entrada(), os = await ordem(fixture), sale = await venda(fixture, os._id);
    const payment = await db.model(Pagamento.name).create({ vendaId: sale._id, formaPagamento: 'pix', valor: '100', dataPagamento: new Date() });
    await evento('recebimento', fixture.recebimento._id, 'TERMO_GERADO');
    await evento('recebimento', fixture.recebimento._id, 'RECEBIMENTO_ATUALIZADO', empresaA, operadorB);
    await evento('venda', sale._id, 'VENDA_GERADA');
    await evento('pagamento', payment._id, 'PAGAMENTO_REGISTRADO');
    await evento('recebimento', fixture.recebimento._id, 'EVENTO_NAO_AUTORIZADO');
    const ficha = await consulta(fixture.recebimento._id);
    assert.equal(itens(ficha.linhaTempo).length, 4);
    assert.ok(itens(ficha.linhaTempo).some((e) => e.titulo === 'Entrada atualizada' && e.ator === 'Equipe'));
    assert.ok(itens(ficha.linhaTempo).some((e) => e.dominio === 'pagamento' && e.titulo === 'Pagamento registrado' && e.ator === 'Operador A'));
    for (const secret of ['TOKEN_AUDITORIA_PRIVADO', '987654321', 'EVENTO_NAO_AUTORIZADO', 'OPERADOR_EXTERNO_PRIVADO']) assert.ok(!JSON.stringify(ficha).includes(secret));
    const logRead = mock.method(db.model(LogEvento.name), 'find', () => { throw new Error('Auditoria indisponível'); });
    try { const partial = await consulta(fixture.recebimento._id); assert.equal(partial.linhaTempo.estado, 'indisponivel'); assert.ok(!('itens' in partial.linhaTempo)); }
    finally { logRead.mock.restore(); }
  });

  it('retomada de anexos respeita o papel e toda referência de ação existe entre as permitidas', async () => {
    const fixture = await entrada();
    await db.model(RecebimentoEquipamento.name).updateOne({ _id: fixture.recebimento._id }, { $set: { estadoSalvamento: 'pendente_midias' } });
    const receiver = await consulta(fixture.recebimento._id, 'recebimento');
    assert.equal(receiver.proximaAcao.acaoId, 'retomar_anexos');
    assert.equal(receiver.acoesPermitidas.find((a) => a.id === 'retomar_anexos')?.href, `/recebimentos/novo?retomar=${fixture.recebimento._id}`);
    assert.equal(receiver.ordensServico.estado, 'sem_acesso'); assert.ok(!('itens' in receiver.ordensServico));
    const tech = await consulta(fixture.recebimento._id, 'tecnico');
    assert.equal(tech.proximaAcao.acaoId, undefined);
    for (const ficha of [receiver, tech]) for (const pending of ficha.pendencias) if (pending.acaoId) assert.ok(ficha.acoesPermitidas.some((a) => a.id === pending.acaoId));
    const combined = await request(app.getHttpServer()).get(`/atendimentos/${fixture.recebimento._id}`).set('x-test-profile', 'tecnico').set('x-test-extra-profile', 'recebimento').expect(200);
    assert.equal(combined.body.proximaAcao.acaoId, 'retomar_anexos');
  });

  it('aprovação preserva o vínculo via orçamento e múltiplas ordens exigem conferência', async () => {
    const fixture = await entrada();
    const quote = await db.model(Orcamento.name).create({ empresaId: empresaA, clienteId: fixture.cliente._id, recebimentoEquipamentoId: fixture.recebimento._id, criadoPor: operadorA, status: 'aprovado', validade: new Date(), subtotal: '50', total: '50' });
    const approved = await consulta(fixture.recebimento._id, 'atendente');
    assert.equal(approved.proximaAcao.acaoId, 'abrir_os_aprovada');
    assert.equal(approved.acoesPermitidas.find((a) => a.id === 'abrir_os_aprovada')?.href, `/orcamentos/${quote._id}`);
    await ordem(fixture, 'aberta', { orcamentoId: quote._id }); await ordem(fixture, 'em_execucao', { orcamentoId: quote._id });
    const multi = await consulta(fixture.recebimento._id);
    assert.equal(multi.etapas.tecnico.codigo, 'multiplas_ordens'); assert.equal(multi.proximaAcao.label, 'Conferir as ordens vinculadas');
    assert.ok(multi.acoesPermitidas.some((a) => a.id === multi.proximaAcao.acaoId));
  });
});
