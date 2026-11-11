import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientesService } from '../src/clientes/clientes.service';
import { CLIENTE_DOCUMENTO_INDEX, ClienteDocument, ClienteSchema } from '../src/clientes/schemas/cliente.schema';
import { CreateClienteDto } from '../src/clientes/dto/create-cliente.dto';
import { UpdateClienteDto } from '../src/clientes/dto/update-cliente.dto';

const CPF_VALIDO = '529.982.247-25';
const OUTRO_CPF = '111.444.777-35';

describe('CPF/CNPJ opcional no cadastro de clientes', { timeout: 120000 }, () => {
  let server: MongoMemoryReplSet, db: Connection, model: Model<ClienteDocument>, clientes: ClientesService;
  const empresa = new Types.ObjectId().toString();
  const outraEmpresa = new Types.ObjectId().toString();

  before(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    db = await mongoose.createConnection(server.getUri()).asPromise();
    model = db.model<ClienteDocument>('Cliente', ClienteSchema);
    await model.syncIndexes();
    clientes = new ClientesService(model as never, { registrarEventoNegocio: async () => undefined } as never);
  });
  after(async () => { await db?.close(); await server?.stop(); });

  it('o índice de documento é único só entre documentos preenchidos', async () => {
    const indice = (await model.collection.indexes()).find((i) => i.name === CLIENTE_DOCUMENTO_INDEX);
    assert.ok(indice?.unique);
    assert.deepEqual(indice?.partialFilterExpression, { cpfCnpj: { $gt: '' } });
  });

  it('aceita vários clientes sem documento e não grava texto vazio', async () => {
    const a = await clientes.create({ empresaId: empresa, nome: 'Sem documento A' } as CreateClienteDto);
    const b = await clientes.create({ empresaId: empresa, nome: 'Sem documento B', cpfCnpj: '' } as CreateClienteDto);
    assert.equal(a.cpfCnpj, undefined);
    const gravado = await model.findById(b._id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(gravado, 'cpfCnpj'), false);
  });

  it('continua recusando documento repetido na mesma empresa, mas aceita em outra', async () => {
    await clientes.create({ empresaId: empresa, nome: 'Com CPF', cpfCnpj: CPF_VALIDO } as CreateClienteDto);
    await assert.rejects(
      clientes.create({ empresaId: empresa, nome: 'Repetido', cpfCnpj: CPF_VALIDO } as CreateClienteDto),
      /já está cadastrado/,
    );
    await clientes.create({ empresaId: outraEmpresa, nome: 'Outra empresa', cpfCnpj: CPF_VALIDO } as CreateClienteDto);
  });

  it('na edição, preencher completa o documento, apagar remove e repetir responde 409', async () => {
    const cliente = await clientes.create({ empresaId: empresa, nome: 'Vai receber CPF' } as CreateClienteDto);
    const id = String(cliente._id);

    const comCpf = await clientes.update(id, { cpfCnpj: OUTRO_CPF } as UpdateClienteDto, undefined, empresa);
    assert.equal(comCpf?.cpfCnpj, OUTRO_CPF);

    await assert.rejects(
      clientes.update(id, { cpfCnpj: CPF_VALIDO } as UpdateClienteDto, undefined, empresa),
      /já está cadastrado/,
    );

    const semCpf = await clientes.update(id, { cpfCnpj: '', nome: 'Sem CPF de novo' } as UpdateClienteDto, undefined, empresa);
    assert.equal(semCpf?.cpfCnpj, undefined);
    assert.equal(semCpf?.nome, 'Sem CPF de novo');

    const soNome = await clientes.update(id, { telefone: '11999990000' } as UpdateClienteDto, undefined, empresa);
    assert.equal(soNome?.telefone, '11999990000');
  });

  it('a conferência de possíveis repetidos funciona sem documento', async () => {
    const resultado = await clientes.verificarPossiveisDuplicados({ nome: 'Sem documento A' }, empresa);
    assert.equal(resultado.documentoEmUso, false);
    assert.equal(resultado.nomeCorrespondencias, 1);
    await assert.rejects(clientes.verificarPossiveisDuplicados({ cpfCnpj: '123' }, empresa), /CPF ou CNPJ válido/);
  });

  it('a validação da API aceita documento vazio e recusa documento inválido', async () => {
    const erros = async (dados: Record<string, unknown>) =>
      (await validate(plainToInstance(CreateClienteDto, { empresaId: empresa, nome: 'X', ...dados }))).map((e) => e.property);
    assert.deepEqual(await erros({}), []);
    assert.deepEqual(await erros({ cpfCnpj: '' }), []);
    assert.deepEqual(await erros({ cpfCnpj: '  ' }), []);
    assert.deepEqual(await erros({ cpfCnpj: CPF_VALIDO }), []);
    assert.deepEqual(await erros({ cpfCnpj: '123.456.789-00' }), ['cpfCnpj']);
  });
});
