# Lote 30 — aviso de possíveis clientes duplicados

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou alteração de dados existentes.

## Comportamento

Antes de cadastrar, a tela consulta possíveis correspondências na empresa selecionada:

- **CPF/CNPJ já cadastrado:** o sistema interrompe o cadastro e orienta a pessoa a procurar o registro existente. A conferência inclui clientes inativos, pois o documento continua único para a empresa.
- **Nome ou telefone igual:** a tela explica o sinal encontrado e oferece “Prosseguir com novo cadastro” ou “Revisar dados”. O aviso não altera registros existentes e não executa mesclagem.
- **Sem correspondência:** o cadastro segue normalmente.

A consulta retorna somente se o documento está em uso e quantas coincidências houve por nome/telefone; não devolve nome, telefone, documento nem ID dos outros clientes. A busca é isolada pela empresa autenticada e requer permissão de criação. A gravação também transforma uma colisão concorrente do índice único em resposta 409 com orientação legível.

## API

`GET /clientes/possiveis-duplicados?cpfCnpj=...&nome=...&telefone=...`

Resposta: `documentoEmUso`, `nomeCorrespondencias` e `telefoneCorrespondencias`. A rota não substitui a restrição única existente em `{empresaId, cpfCnpj}`.

## Arquivos envolvidos

- Backend: `src/clientes/clientes.controller.ts` e `src/clientes/clientes.service.ts`.
- Frontend: `src/components/ResourceForm.tsx`, `src/components/EmpresaResourceForm.tsx`, `src/modules/clientes/clientes.service.ts` e `src/modules/clientes/pages/ClienteFormPage.tsx`.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Build backend | Aprovado |
| Typecheck frontend | Aprovado |
| Lint frontend | Aprovado |
| Build frontend | Aprovado; pacote principal de 552,12 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de fim de linha para CRLF |

Testes automatizados e verificação manual no navegador não foram executados nesta etapa.

## Limites

- A conferência procura documento equivalente ignorando pontuação, nome exato sem diferenciar maiúsculas/minúsculas e telefone equivalente ignorando pontuação. Ela não tenta inferir parentesco ou semelhança aproximada de nomes.
- Não normaliza nem modifica registros históricos e não une cadastros.
- A unicidade continua sendo validada pelo índice já existente no banco. Nenhuma migração foi executada.
