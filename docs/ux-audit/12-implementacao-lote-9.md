# Lote 9 — autoria da OS e proteção do recebimento vinculado

Data: 08/11/2026. Implementação local no backend, continuando o [Lote 8](11-implementacao-lote-8.md). Nenhum deploy ou migração foi executado.

## Resultado

As chamadas HTTP de OS agora passam a identidade do operador autenticado até a trilha de auditoria e os movimentos de estoque. Criação da OS, mudança de etapa, consumo/reserva de peça e retirada deixam de atribuir a operação à pessoa técnica apenas por ela estar designada na OS. A geração da OS a partir de orçamento também preserva o operador autenticado.

A remoção de um recebimento agora verifica referências a OS, orçamento, checklist, componente ausente, mídia e termo. Se houver qualquer vínculo, retorna conflito explicando que o histórico deve ser preservado. Se estiver sem vínculos, a remoção e seu evento de auditoria são gravados na mesma transação.

Foi incluído o evento `RECEBIMENTO_REMOVIDO` na linha do tempo. Os eventos de retirada continuam armazenando o hash da assinatura, sem registrar a imagem bruta na auditoria.

## Limites

- Chamadas HTTP passam o operador autenticado. Chamadas internas legadas que não fornecem ator ainda usam a pessoa técnica atribuída como compatibilidade; esses chamadores precisam ser migrados para identidade explícita.
- A proteção de remoção cobre vínculos do fluxo principal. Outros módulos que possam referenciar recebimentos precisam ser incluídos antes de ampliar a exclusão física.
- O lote não torna o ledger de estoque imutável nem define correções de histórico; isso continua condicionado à decisão D1.
- A transação de remoção e auditoria exige suporte a transações Mongo no ambiente de execução.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck | Aprovado. |
| Backend: lint de CI | 0 erros; 19 avisos existentes. |
| Backend: build | Aprovado. |
| `git diff --check` | Aprovado; avisos somente de conversão de finais de linha no Windows. |
| Testes automatizados | Não executados neste lote. |

O setup da integração de referências foi atualizado para fornecer os modelos usados na verificação de vínculos. A suíte não foi executada neste lote; a nova proteção de remoção ainda precisa de cenário de integração antes da homologação.

## Arquivos principais

- `src/ordens-servico/os.controller.ts` e `src/ordens-servico/os.service.ts`.
- `src/orcamentos/orcamentos.service.ts` (geração de OS).
- `src/recebimento/recebimento-equipamento/recebimento-equipamento.controller.ts`, `service.ts` e `module.ts`.
- `src/auditoria/auditoria-eventos.ts`, `src/atendimentos/atendimentos.service.ts` e `test/tenant-client-references.integration.ts`.

## Próximo passo

Continuam pendentes a autoria explícita em chamadores internos legados e a validação integrada de exclusão protegida. Fluxos de cancelamento, devolução e correção de assinatura seguem condicionados às decisões D5–D7.
