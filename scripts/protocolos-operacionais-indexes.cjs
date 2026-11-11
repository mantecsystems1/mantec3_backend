// Plano e preflight dos índices dos protocolos. Não altera documentos existentes.
const mongoose = require('mongoose');

const indexes = [
  {
    collection: 'recebimentosEquipamento',
    keys: { empresaId: 1, numero: 1 },
    options: { unique: true, partialFilterExpression: { numero: { $type: 'string' } } },
  },
  {
    collection: 'orcamentos',
    keys: { empresaId: 1, numero: 1 },
    options: { unique: true, partialFilterExpression: { numero: { $type: 'string' } } },
  },
  {
    collection: 'ordensServico',
    keys: { empresaId: 1, numero: 1 },
    options: { unique: true, partialFilterExpression: { numero: { $type: 'string' } } },
  },
  {
    collection: 'vendas',
    keys: { empresaId: 1, numero: 1 },
    options: { unique: true, partialFilterExpression: { numero: { $type: 'string' } } },
  },
];

function argumentos() {
  const valor = (nome) => {
    const indice = process.argv.indexOf(nome);
    return indice < 0 ? undefined : process.argv[indice + 1];
  };
  return { empresa: valor('--empresa'), variavelUri: valor('--uri-env') };
}

function mesmoDocumento(a, b) {
  return JSON.stringify(Object.entries(a || {})) === JSON.stringify(Object.entries(b || {}));
}

async function indicesExistentes(collection) {
  try {
    return await collection.indexes();
  } catch (erro) {
    if (erro?.codeName === 'NamespaceNotFound' || erro?.code === 26) return [];
    throw erro;
  }
}

async function diagnosticar(collection, keys, empresa) {
  const filtroParcial = { numero: { $type: 'string' } };
  if (empresa) filtroParcial.empresaId = new mongoose.Types.ObjectId(empresa);
  const chavesGrupo = Object.fromEntries(Object.keys(keys).map((campo) => [campo, `$${campo}`]));
  const resultado = await collection.aggregate([
    { $match: filtroParcial },
    { $group: { _id: chavesGrupo, quantidade: { $sum: 1 } } },
    { $match: { quantidade: { $gt: 1 } } },
    {
      $group: {
        _id: '$_id.empresaId',
        gruposDuplicados: { $sum: 1 },
        registrosConflitantes: { $sum: '$quantidade' },
        maiorGrupo: { $max: '$quantidade' },
      },
    },
    {
      $project: {
        _id: 0,
        empresaId: { $toString: '$_id' },
        gruposDuplicados: 1,
        registrosConflitantes: 1,
        maiorGrupo: 1,
      },
    },
    { $sort: { empresaId: 1 } },
  ], { maxTimeMS: 120000, allowDiskUse: true }).toArray();
  return resultado;
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const ler = process.argv.includes('--read');
  const { empresa, variavelUri } = argumentos();

  if (!aplicar && !ler) {
    console.log(JSON.stringify({ modo: 'plano_sem_conexao', indexes }, null, 2));
    return;
  }
  if (aplicar && empresa) throw new Error('A aplicação do índice exige preflight completo, sem filtro de empresa.');
  if (empresa && !/^[a-f\d]{24}$/i.test(empresa)) throw new Error('Empresa inválida.');
  if (!variavelUri || !process.env[variavelUri]) throw new Error('Informe --uri-env com a variável do ambiente autorizado.');

  const db = await mongoose.createConnection(process.env[variavelUri], {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  }).asPromise();

  try {
    const resultados = [];
    for (const index of indexes) {
      const collection = db.collection(index.collection);
      const [duplicatas, existentes] = await Promise.all([
        diagnosticar(collection, index.keys, empresa),
        indicesExistentes(collection),
      ]);
      const indiceExistente = existentes.some((existente) =>
        existente.unique === true
        && mesmoDocumento(existente.key, index.keys)
        && mesmoDocumento(existente.partialFilterExpression || {}, index.options.partialFilterExpression || {}));
      const porEmpresa = duplicatas;
      resultados.push({
        collection: index.collection,
        gruposDuplicados: porEmpresa.reduce((total, item) => total + item.gruposDuplicados, 0),
        registrosConflitantes: porEmpresa.reduce((total, item) => total + item.registrosConflitantes, 0),
        porEmpresa,
        indiceUnicoJaAtivo: indiceExistente,
      });
    }

    console.log(JSON.stringify({ modo: aplicar ? 'preflight_e_aplicacao' : 'somente_leitura', resultados }, null, 2));
    const conflitos = resultados.some((resultado) => resultado.gruposDuplicados > 0);
    if (conflitos) throw new Error('Há protocolos duplicados; nenhum índice novo foi criado.');
    if (!aplicar) return;

    for (const index of indexes) {
      const resultado = resultados.find((item) => item.collection === index.collection);
      if (resultado?.indiceUnicoJaAtivo) continue;
      await db.collection(index.collection).createIndex(index.keys, index.options);
    }
    console.log('Índices de protocolo conferidos/criados. Nenhum registro foi alterado.');
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error('Preflight interrompido. Nenhum registro foi alterado; confira o ambiente e os conflitos antes de ativar os índices.');
  process.exitCode = 1;
});
