const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const envPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = process.env[key] || value;
  }
}

const requestedUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mantec';
const fallbackUri = requestedUri.replace('://mongo:', '://127.0.0.1:');
const adminEmail = process.env.ADMIN_EMAIL || 'admin@mantec.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';

const buildSenhaHash = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
};

const connect = async () => {
  try {
    await mongoose.connect(requestedUri);
    return requestedUri;
  } catch (error) {
    if (requestedUri !== fallbackUri) {
      await mongoose.connect(fallbackUri);
      return fallbackUri;
    }

    throw error;
  }
};

const getOrCreateEmpresa = async (db) => {
  const configuredEmpresaId = process.env.ADMIN_EMPRESA_ID;

  if (configuredEmpresaId) {
    const empresa = await db.collection('empresas').findOne({
      _id: new mongoose.Types.ObjectId(configuredEmpresaId),
    });

    if (empresa) return empresa;
  }

  const empresa = await db.collection('empresas').findOne({});
  if (empresa) return empresa;

  const now = new Date();
  const result = await db.collection('empresas').insertOne({
    nomeFantasia: 'Mantec Admin',
    razaoSocial: 'Mantec Admin',
    cnpj: '00000000000100',
    email: adminEmail,
    telefone: '(00) 0000-0000',
    endereco: {
      logradouro: 'Sistema',
      numero: '0',
      bairro: 'Sistema',
      cidade: 'Sistema',
      estado: 'SP',
      cep: '00000000',
    },
    ativa: true,
    criadoEm: now,
    atualizadoEm: now,
  });

  return {
    _id: result.insertedId,
    nomeFantasia: 'Mantec Admin',
    razaoSocial: 'Mantec Admin',
  };
};

const main = async () => {
  const connectedUri = await connect();
  const db = mongoose.connection.db;
  const empresa = await getOrCreateEmpresa(db);

  await db.collection('usuarios').updateOne(
    { email: adminEmail.trim().toLowerCase() },
    {
      $set: {
        empresaId: empresa._id,
        nome: 'Administrador',
        email: adminEmail.trim().toLowerCase(),
        senhaHash: buildSenhaHash(adminPassword),
        ativo: true,
        perfil: 'admin',
      },
      $setOnInsert: {
        criadoEm: new Date(),
      },
    },
    { upsert: true },
  );

  console.log('Acesso admin criado/atualizado com sucesso.');
  console.log(`Email: ${adminEmail.trim().toLowerCase()}`);
  console.log(`Senha: ${adminPassword}`);
  console.log('Perfil: admin');
  console.log(`Empresa: ${empresa.nomeFantasia || empresa.razaoSocial || empresa._id}`);
  console.log(`Mongo: ${connectedUri.replace(/\/\/.*@/, '//***@')}`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Nao foi possivel criar o acesso admin.');
  console.error(error.message || error);

  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }

  process.exit(1);
});
