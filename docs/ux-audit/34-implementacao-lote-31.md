# Lote 31 — comunicação preparada e confirmação manual

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou envio de mensagens.

## Comportamento

- Toda comunicação nova começa como **Preparada · envio não confirmado**. Não é possível criar uma mensagem já marcada como enviada.
- Preparar uma mensagem para WhatsApp/e-mail continua separado do envio real. Abrir o aplicativo externo não altera o status.
- Para registrar um resultado, a pessoa escolhe “Enviada”, “Lida” ou “Falha” e descreve o que observou. O sistema salva origem manual, pessoa responsável, horário e observação.
- O histórico do cliente e a lista de comunicações mostram o status junto da origem. Registros antigos sem origem identificada são marcados como “origem não registrada”, sem presumir que houve confirmação.
- A mudança de status tem transições controladas e fica na auditoria. O PATCH genérico não aceita trocar status. Escrita e leitura são limitadas à empresa da sessão; cliente vinculado precisa pertencer à mesma empresa.

## API e dados

`POST /notificacao/:id/confirmar-status-manual` aceita `status` (`enviada`, `lida` ou `falha`) e uma observação não vazia de 5 a 500 caracteres. A rota requer permissão de comunicação. Não há adaptador de provedor nem callback nesta etapa.

A notificação recebe campos opcionais de origem, data, operador e observação da confirmação. São adições ao schema MongoDB; nenhum backfill foi executado.

## Arquivos principais

- Backend: `src/comunicacao/notificacoes/notificacao.service.ts`, `notificacao.controller.ts`, `notificacao.schema.ts` e `dto/confirmar-status-manual.dto.ts`.
- Frontend: `src/modules/comunicacao/pages/NotificacoesPage.tsx`, `comunicacao.types.ts`, `comunicacao.service.ts` e `src/modules/clientes/pages/ClienteDetailPage.tsx`.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; pacote principal do frontend com 561,02 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de LF para CRLF |

Testes automatizados e conferência manual no navegador não foram executados nesta etapa. Nenhuma mensagem foi enviada.

