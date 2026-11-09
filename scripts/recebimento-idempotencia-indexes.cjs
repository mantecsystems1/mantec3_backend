// Aditivo: não apaga índices nem altera registros. Sem --apply, apenas imprime o plano.
const mongoose = require('mongoose');
const indexes = [
  { collection: 'operacoesVendas', keys: { empresaId: 1, operacaoId: 1 }, options: { unique: true } },
  { collection: 'orcamentos', keys: { empresaId: 1, criadoPor: 1, operacaoId: 1 }, options: { unique: true, partialFilterExpression: { operacaoId: { $type: 'string' } } } },
  { collection: 'recebimentosEquipamento', keys: { empresaId: 1, recebidoPor: 1, operacaoId: 1 }, options: { unique: true, partialFilterExpression: { operacaoId: { $type: 'string' } } } },
  { collection: 'midiasRecebimento', keys: { recebimentoEquipamentoId: 1, chaveCliente: 1 }, options: { unique: true, partialFilterExpression: { chaveCliente: { $type: 'string' } } } },
  { collection: 'rascunhosRecebimento', keys: { empresaId: 1, operadorId: 1, operacaoId: 1 }, options: { unique: true } },
  { collection: 'rascunhosRecebimento', keys: { empresaId: 1, operadorId: 1, estado: 1, atualizadoEm: -1 }, options: {} },
];
async function main() {
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ modo: 'plano_sem_conexao', indexes }, null, 2)); return; }
  const position = process.argv.indexOf('--uri-env');
  const variable = position >= 0 ? process.argv[position + 1] : undefined;
  if (!variable || !process.env[variable]) throw new Error('Informe --uri-env com a variável de conexão do ambiente aprovado.');
  const db = await mongoose.createConnection(process.env[variable], { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
  try {
    for (const index of indexes) await db.collection(index.collection).createIndex(index.keys, index.options);
    console.log('Índices de idempotência conferidos/criados. Nenhum registro foi alterado.');
  } finally { await db.close(); }
}
main().catch(() => { console.error('Não foi possível conferir os índices. Nenhum índice foi removido; revise conflitos e o ambiente selecionado.'); process.exitCode = 1; });
