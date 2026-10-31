const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
  console.error('Informe MONGO_URI para executar a migracao de indices.');
  process.exit(1);
}

const indexes = [
  {
    collection: 'fiscalEmitterRegistrations',
    create: [[{ empresaId: 1 }, { unique: true, name: 'empresaId_1' }]],
  },
  {
    collection: 'fiscalSimulationBindings',
    create: [[{ empresaId: 1 }, { unique: true, name: 'empresaId_1' }],
      [{ emitterId: 1 }, { unique: true, name: 'emitterId_1' }]],
  },
  {
    collection: 'fiscalSimulations',
    create: [[{ empresaId: 1, requestId: 1 }, { unique: true, name: 'empresaId_1_requestId_1' }],
      [{ empresaId: 1, _id: -1 }, { name: 'empresaId_1__id_-1' }]],
  },
  {
    collection: 'clientes',
    drop: ['cpfCnpj_1'],
    create: [
      [{ empresaId: 1, cpfCnpj: 1 }, { unique: true, name: 'empresa_cpfCnpj_unique' }],
      [{ empresaId: 1, ativo: 1, nome: 1 }, { name: 'empresa_ativo_nome' }],
    ],
  },
  {
    collection: 'fornecedores',
    drop: ['cnpj_1'],
    create: [
      [{ empresaId: 1, cnpj: 1 }, { unique: true, name: 'empresa_cnpj_unique' }],
      [{ empresaId: 1, ativo: 1, nome: 1 }, { name: 'empresa_ativo_nome' }],
    ],
  },
  {
    collection: 'produtos',
    create: [
      [{ empresaId: 1, ativo: 1, nome: 1 }, { name: 'empresa_ativo_nome' }],
      [{ empresaId: 1, codigoInterno: 1 }, { name: 'empresa_codigoInterno' }],
      [{ empresaId: 1, tipoProduto: 1, aparelhoModeloId: 1 }, { name: 'empresa_tipo_modelo' }],
    ],
  },
  {
    collection: 'servicos',
    create: [[{ empresaId: 1, ativo: 1, nome: 1 }, { name: 'empresa_ativo_nome' }]],
  },
  {
    collection: 'orcamentos',
    create: [
      [{ empresaId: 1, status: 1, criadoEm: -1 }, { name: 'empresa_status_criadoEm' }],
      [{ empresaId: 1, clienteId: 1, criadoEm: -1 }, { name: 'empresa_cliente_criadoEm' }],
      [{ empresaId: 1, recebimentoEquipamentoId: 1 }, { name: 'empresa_recebimento' }],
    ],
  },
  {
    collection: 'itensOrcamento',
    create: [[{ orcamentoId: 1 }, { name: 'orcamentoId' }]],
  },
  {
    collection: 'vendas',
    create: [
      [{ empresaId: 1, statusFinanceiro: 1, criadoEm: -1 }, { name: 'empresa_statusFinanceiro_criadoEm' }],
      [{ empresaId: 1, clienteId: 1, criadoEm: -1 }, { name: 'empresa_cliente_criadoEm' }],
      [{ empresaId: 1, origemTipo: 1, origemId: 1 }, { name: 'empresa_origem' }],
    ],
  },
  {
    collection: 'itensVenda',
    create: [[{ vendaId: 1 }, { name: 'vendaId' }]],
  },
  {
    collection: 'pagamentos',
    create: [
      [{ vendaId: 1, dataPagamento: -1 }, { name: 'venda_dataPagamento' }],
      [{ tituloFinanceiroId: 1 }, { name: 'tituloFinanceiroId' }],
      [{ movimentoCaixaId: 1 }, { name: 'movimentoCaixaId' }],
    ],
  },
  {
    collection: 'pedidosCompra',
    create: [
      [{ empresaId: 1, status: 1, criadoEm: -1 }, { name: 'empresa_status_criadoEm' }],
      [{ empresaId: 1, fornecedorId: 1, criadoEm: -1 }, { name: 'empresa_fornecedor_criadoEm' }],
    ],
  },
  {
    collection: 'itensPedidoCompra',
    create: [
      [{ pedidoCompraId: 1 }, { name: 'pedidoCompraId' }],
      [{ produtoId: 1 }, { name: 'produtoId' }],
    ],
  },
  {
    collection: 'movimentosEstoque',
    create: [
      [{ empresaId: 1, produtoId: 1, criadoEm: -1 }, { name: 'empresa_produto_criadoEm' }],
      [{ empresaId: 1, origemTipo: 1, origemId: 1 }, { name: 'empresa_origem' }],
    ],
  },
  {
    collection: 'ordensServico',
    create: [
      [{ empresaId: 1, statusOperacional: 1, criadoEm: -1 }, { name: 'empresa_statusOperacional_criadoEm' }],
      [{ empresaId: 1, clienteId: 1, criadoEm: -1 }, { name: 'empresa_cliente_criadoEm' }],
      [{ empresaId: 1, orcamentoId: 1 }, { name: 'empresa_orcamento' }],
      [{ empresaId: 1, recebimentoEquipamentoId: 1 }, { name: 'empresa_recebimento' }],
    ],
  },
  {
    collection: 'pecasReservadasOS',
    create: [
      [{ ordemServicoId: 1 }, { name: 'ordemServicoId' }],
      [{ produtoId: 1 }, { name: 'produtoId' }],
    ],
  },
];

async function dropIndexIfExists(collection, indexName) {
  const existing = await collection.indexes();
  if (!existing.some((index) => index.name === indexName)) {
    return;
  }

  await collection.dropIndex(indexName);
  console.log(`Indice removido: ${collection.collectionName}.${indexName}`);
}

async function run() {
  await mongoose.connect(uri);

  for (const definition of indexes) {
    const collection = mongoose.connection.collection(definition.collection);

    for (const indexName of definition.drop || []) {
      await dropIndexIfExists(collection, indexName);
    }

    for (const [keys, options] of definition.create || []) {
      await collection.createIndex(keys, options);
      console.log(`Indice garantido: ${definition.collection}.${options.name}`);
    }
  }

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
