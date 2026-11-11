#!/usr/bin/env node
// Compara a quantidade de documentos por coleção entre dois bancos (origem × restaurado).
// Uso: node ops/mongo-compare-counts.cjs "<uri origem>" <banco origem> "<uri destino>" <banco destino>
// Sai com código 1 se alguma coleção divergir. Não altera dados.
'use strict';
const { MongoClient } = require('mongodb');

async function counts(uri, dbName) {
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const result = {};
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (name.startsWith('system.')) continue;
      result[name] = await db.collection(name).countDocuments();
    }
    return result;
  } finally {
    await client.close();
  }
}

(async () => {
  const [uriA, dbA, uriB, dbB] = process.argv.slice(2);
  if (!uriA || !dbA || !uriB || !dbB) {
    console.error('Uso: node ops/mongo-compare-counts.cjs "<uri origem>" <banco origem> "<uri destino>" <banco destino>');
    process.exit(2);
  }
  const [a, b] = await Promise.all([counts(uriA, dbA), counts(uriB, dbB)]);
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  let divergent = 0;
  for (const name of names) {
    const ok = a[name] === b[name];
    if (!ok) divergent += 1;
    console.log(`${ok ? 'OK ' : 'DIF'} ${name}: origem=${a[name] ?? '-'} destino=${b[name] ?? '-'}`);
  }
  console.log(divergent ? `${divergent} coleção(ões) divergente(s).` : `Todas as ${names.length} coleções conferem.`);
  process.exit(divergent ? 1 : 0);
})().catch((error) => {
  console.error('Falha ao comparar:', error.message);
  process.exit(1);
});
