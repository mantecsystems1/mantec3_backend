# Lote 37 — preflight e ativação dos índices de protocolo

Data: 08/11/2026  
Situação: índices únicos ativados e conferidos em homologação; nenhum registro foi alterado.

## Resultado

Foi criado `scripts/protocolos-operacionais-indexes.cjs` para preparar a ativação dos índices únicos de número de recebimento, orçamento e OS.

Antes da criação, executei uma agregação somente leitura nas três coleções. Ela contou grupos duplicados e documentos conflitantes por empresa, sem listar clientes, equipamentos ou números de protocolo. O preflight repetido imediatamente antes da ativação também encontrou zero conflitos.

| Coleção | Grupos com duplicata antes | Registros conflitantes | Índice antes | Índice depois |
|---|---:|---:|---|---|
| `recebimentosEquipamento` | 0 | 0 | Inativo | Ativo |
| `orcamentos` | 0 | 0 | Inativo | Ativo |
| `ordensServico` | 0 | 0 | Inativo | Ativo |

Os índices usam a chave `empresaId + numero` e filtro parcial para números do tipo texto, conforme definido nos schemas. Assim, os números novos ficam únicos por empresa; registros antigos sem número não são alterados nem incluídos na restrição.

## Execução e segurança

A ativação ocorreu em homologação em uma tarefa temporária no nó da API, usando o segredo já montado pelo serviço. A tarefa ficou limitada a 0,25 CPU e 192 MB, repetiu o preflight, criou apenas os três índices aprovados e confirmou cada um após a criação.

O serviço temporário foi removido ao terminar e sua ausência foi conferida. Nenhum documento foi renumerado, apagado ou atualizado. Não houve backfill, publicação de código ou alteração no frontend.

## Limites e próximos passos

- O índice garante unicidade para números preenchidos em cada empresa. Registros antigos que ainda não têm número continuam como estão.
- As listas paginadas centrais continuam compatíveis com as rotas antigas; revisão das demais listas permanece pendente.
- A ativação foi feita somente em homologação. Publicação do código local e eventual réplica desta operação em produção são etapas separadas.

## Validação

| Verificação | Resultado |
|---|---|
| Preflight imediatamente antes de criar | Aprovado: zero duplicatas nas três coleções |
| Verificação após criar | Aprovado: os três índices únicos constam ativos |
| Saúde da API de homologação | Aprovado: `status: ok`, banco conectado |
| Tarefa temporária | Removida; ausência confirmada |
| Alteração de registros | Nenhuma |
| Backfill, publicação e testes automatizados | Não executados |

Arquivo de apoio: `scripts/protocolos-operacionais-indexes.cjs`. Plano: `02-plano-implementacao.md`.
