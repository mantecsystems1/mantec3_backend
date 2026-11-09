# Lote 34 — correção versionada de checklist concluído

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou migração de dados.

## Nova revisão depois da conclusão

Uma OS concluída com checklist pode receber uma correção quando um responsável autorizado identificar um dado incorreto. A correção:

- exige justificativa com pelo menos 10 caracteres;
- exige informar novamente os sete resultados, mantendo observação obrigatória para cada falha;
- identifica o responsável que registrou a correção, a data e o número da nova revisão;
- preserva o checklist anterior e o checklist corrigido no evento de auditoria, junto com a justificativa;
- mantém a OS concluída e não altera a retirada assinada.

A página mostra a revisão atual, a pessoa e a justificativa da última correção. O histórico completo das versões anteriores permanece na linha do tempo da OS. O responsável precisa carregar a revisão atual; uma tentativa baseada em uma revisão antiga retorna conflito e orienta recarregar.

## Autorização

Foi criado o evento `os.corrigir_checklist_qualidade`, separado da permissão para técnicos registrarem resultados antes da conclusão. Por padrão, administrador, administrador da empresa e gerente podem executar a correção. A rota também verifica a empresa da sessão, o estado concluído da OS e a permissão no backend.

Uma OS concluída sem checklist anterior não aceita correção por este fluxo. A correção requer exatamente um resultado para cada código reconhecido. Falhas podem ser registradas com justificativa e permanecem visíveis na versão atual; a OS não é reaberta automaticamente.

## Contrato

`POST /ordens-servico/:id/checklist-qualidade/correcoes`

Corpo: `itens` (sete resultados), `motivo` (10 a 1000 caracteres) e `revisaoEsperada` (inteiro). O serviço grava a revisão atualizada e os metadados da última correção; a linha do tempo guarda snapshots anterior/novo, motivo e números de revisão.

## Arquivos principais

- Backend: `src/permissoes/matriz-permissoes.ts`, `src/ordens-servico/dto/registrar-correcao-checklist-qualidade.dto.ts`, `src/ordens-servico/os.controller.ts`, `src/ordens-servico/os.service.ts`, `src/ordens-servico/schemas/ordem-servico.schema.ts` e `src/auditoria/auditoria-eventos.ts`.
- Frontend: `src/constants/business-events.constants.ts`, `src/modules/atendimento/ordemServico/ordensServico.service.ts`, `pages/OrdemServicoDetailPage.tsx` e `src/modules/auditoria/components/AuditTimeline.tsx`.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Limites

A OS permanece concluída mesmo se a correção registrar uma falha. Este fluxo registra a correção do checklist e não inicia reparo adicional, reabre atendimento ou altera o comprovante de retirada. Um PDF de comprovante com versão própria e retificação após assinatura permanecem decisões separadas.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; chunk principal do frontend com 572,90 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de LF para CRLF |

Testes automatizados e conferência manual no navegador não foram executados. Nenhuma migração, backfill ou publicação foi realizada.
