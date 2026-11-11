# CPF/CNPJ opcional no cliente

Desde esta versão o CPF/CNPJ do cliente é **opcional** (clientes importados do sistema antigo não têm documento). Quando preenchido, continua validado e **único por empresa**.

## Troca do índice no banco (uma vez, depois do deploy)

O índice antigo `empresaId_1_cpfCnpj_1` é único para todos os clientes, inclusive os sem documento: com ele, o segundo cliente sem CPF é recusado. O novo índice `empresaId_1_cpfCnpj_1_preenchido` só vale para documentos preenchidos (`partialFilterExpression: { cpfCnpj: { $gt: '' } }`).

No `mongosh`, com usuário de escrita no banco `mantec`:

```js
const c = db.getSiblingDB('mantec').clientes;
// 1. Garante que não há texto vazio gravado como documento (o índice novo ignora, mas a API também não grava mais).
c.updateMany({ cpfCnpj: '' }, { $unset: { cpfCnpj: 1 } });
// 2. Cria o índice novo antes de remover o antigo (a unicidade nunca fica sem proteção).
c.createIndex({ empresaId: 1, cpfCnpj: 1 }, { unique: true, name: 'empresaId_1_cpfCnpj_1_preenchido', partialFilterExpression: { cpfCnpj: { $gt: '' } } });
// 3. Remove o índice antigo.
c.dropIndex('empresaId_1_cpfCnpj_1');
c.getIndexes().map((i) => i.name);
```

A API cria o índice novo sozinha ao subir (autoIndex do Mongoose), mas **não remove o antigo**: o passo 3 é obrigatório antes de importar clientes sem documento.

## Nota fiscal

A emissão não depende do documento do cliente. Se a prefeitura exigir o CPF/CNPJ do tomador, complete o cadastro antes de emitir.
