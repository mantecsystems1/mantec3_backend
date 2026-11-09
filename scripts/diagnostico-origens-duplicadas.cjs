// Somente leitura. Sem --read, imprime o plano sem abrir conexão ou ler credenciais.
const mongoose = require('mongoose');
const collections = [
  { collection: 'ordensServico', origin: '$orcamentoId', filter: { orcamentoId: { $type: 'objectId' } } },
  { collection: 'vendas', origin: '$origemId', filter: { origemTipo: 'ordem_servico', origemId: { $type: 'objectId' } } },
];
async function main() {
  if (!process.argv.includes('--read')) { console.log(JSON.stringify({ modo: 'plano_sem_conexao', collections, limitePorColecao: 100 }, null, 2)); return; }
  const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const empresa = arg('--empresa'), variable = arg('--uri-env');
  if (!empresa || !/^[a-f\d]{24}$/i.test(empresa) || !variable || !process.env[variable]) throw new Error('Argumentos obrigatórios ausentes.');
  const db = await mongoose.createConnection(process.env[variable], { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
  try {
    for (const entry of collections) {
      const groups = await db.collection(entry.collection).aggregate([
        { $match: { ...entry.filter, empresaId: new mongoose.Types.ObjectId(empresa) } },
        { $group: { _id: entry.origin, quantidade: { $sum: 1 } } },
        { $match: { quantidade: { $gt: 1 } } }, { $sort: { quantidade: -1, _id: 1 } }, { $limit: 100 },
      ], { maxTimeMS: 30000 }).toArray();
      console.log(JSON.stringify({ collection: entry.collection, empresaId: empresa, grupos: groups, limite: 100 }));
    }
  } finally { await db.close(); }
}
main().catch(() => { console.error('Diagnóstico não concluído. Confira empresa, variável e acesso de leitura. Nenhum registro foi alterado.'); process.exitCode = 1; });
