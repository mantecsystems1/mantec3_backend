# Lote 29 — códigos operacionais e listas paginadas

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação, migração ou backfill.

## Objetivo

Deixar as referências do fluxo de assistência fáceis de falar, localizar e reconhecer, sem mostrar fragmentos do identificador interno como se fossem números comerciais. Reduzir o volume carregado de uma só vez nas listas de recebimentos, orçamentos e ordens de serviço.

## Códigos gerados

Novas entradas, orçamentos e ordens de serviço recebem um número reservado no servidor:

- Recebimento: `REC-AAAA-000001`
- Orçamento: `ORC-AAAA-000001`
- Ordem de serviço: `OS-AAAA-000001`

A sequência é independente por empresa, tipo de registro e ano. A reserva usa atualização atômica no MongoDB; índices únicos parciais por empresa e número foram declarados nos três schemas. O número não vem do navegador e não pode ser escolhido pelo usuário. Os campos são opcionais, então documentos antigos continuam válidos.

Os registros antigos não receberam códigos retroativos. Nas listas, histórico do cliente, dashboard, ficha, portal e mensagens do orçamento, aparecem como registro antigo/sem código. Navegação e vínculos internos continuam usando o identificador técnico sem expô-lo na tela.

## Listas e contrato da API

Foram adicionadas rotas próprias para paginação; as rotas antigas continuam devolvendo arrays:

- `GET /recebimento-equipamento/paginado`
- `GET /orcamentos/paginado`
- `GET /ordens-servico/paginado`

Parâmetros aceitos: `pagina`, `limite` (25 por padrão, até 100), `busca` (até 100 caracteres), `status`; OS também aceita `prioridade`, e recebimentos aceitam `resultado`. Busca trata a entrada como texto literal e procura código, cliente e equipamento dentro da empresa autenticada. A ordenação usa data de criação e ID para desempatar. A resposta contém `itens`, `pagina`, `limite`, `total` e `totalPaginas`.

As três listas centrais do frontend agora carregam 25 itens por página, mostram o total, oferecem navegação anterior/próxima e mantêm busca/filtros na URL. Os filtros são aplicados no servidor; a busca não fica limitada à página já carregada.

## Arquivos envolvidos

- Backend: `src/common/protocolo-operacional.ts`, `src/common/paginacao-operacional.ts`; schemas e serviços de recebimento, orçamento e OS; controllers das três rotas; `src/atendimentos/atendimentos.service.ts`; consultas de garantia, portal e reservas para incluir o código da OS relacionada.
- Frontend: `src/components/GenericListPage.tsx`; listas de recebimentos, orçamentos e OS; tipos e referências do dashboard, ficha, histórico do cliente, portal, relatórios, orçamento e fluxos que escolhem uma OS.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend | Aprovado |
| Build backend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Typecheck frontend | Aprovado |
| Lint frontend | Aprovado |
| Build frontend | Aprovado; pacote principal de 549,97 kB, acima do aviso configurado de 500 kB |
| Busca por sufixos de ObjectId nas telas do frontend | Sem ocorrências de `slice(-6)` |
| `git diff --check` | Aprovado; Git apenas informou conversões de fim de linha para CRLF |

Testes automatizados e verificação manual no navegador não foram executados nesta etapa.

## Limites antes de ativar em banco existente

- Nenhuma conexão ou comando de migração foi executado. Antes de publicar, verificar se já existem campos `numero` ou duplicatas nas três coleções e confirmar a criação dos índices parciais no ambiente-alvo.
- Não houve backfill. Os dados antigos continuam sem protocolo comercial e não podem ser encontrados por um código novo.
- O frontend passou a consumir as rotas paginadas, portanto backend e frontend devem ser publicados juntos. Os consumidores antigos permanecem compatíveis com as rotas de array.
- A busca de texto é literal e segura contra metacaracteres de regex; seus índices e desempenho precisam ser medidos com volume representativo antes de substituir a compatibilidade antiga em outras listas.
