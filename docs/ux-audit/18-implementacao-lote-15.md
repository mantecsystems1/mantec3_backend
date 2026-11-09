# Lote 15 — autoria real nas mudanças de orçamento

Data: 08/11/2026. Implementação local no backend, continuando a proteção de histórico do [Lote 9](12-implementacao-lote-9.md). Nenhum deploy ou migração foi executado.

## Resultado

Os endpoints autenticados de envio, aprovação, reprovação, cancelamento e atualização de orçamento agora passam o usuário da sessão para o serviço. Quando uma mudança de status grava auditoria, o evento é atribuído a quem executou a ação, em vez de sempre usar a pessoa que criou o orçamento.

O cancelamento por remoção continua limitado a rascunhos, como antes. Agora acontece em transação, verifica a revisão do registro e grava o evento de cancelamento com o operador real. Se outra pessoa alterou o orçamento ao mesmo tempo, a operação retorna conflito em vez de sobrescrever a revisão.

Os contratos HTTP e schemas permanecem iguais. A compatibilidade com chamadas internas sem ator mantém o criador como fallback.

## Limites

- A aprovação/recusa pelo portal do cliente ainda não fornece um usuário interno; segue usando o criador do orçamento como compatibilidade. A auditoria precisa distinguir explicitamente cliente/portal quando essa política for definida.
- Outros módulos além dos escopos Lotes 9 e 15 ainda precisam revisão de autoria.
- Não houve teste integrado de transação/auditoria neste lote.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck | Aprovado. |
| Backend: lint de CI | 0 erros; 19 avisos existentes. |
| Backend: build | Aprovado. |
| `git diff --check` | Aprovado; avisos apenas de conversão de finais de linha no Windows. |
| Testes automatizados | Não executados neste lote. As expectativas existentes do teste do controller foram ajustadas, mas não executadas. |

## Arquivos principais

- `src/orcamentos/orcamentos.controller.ts` e `src/orcamentos/orcamentos.service.ts`.
- `src/orcamentos/orcamentos.controller.spec.ts` (expectativas atualizadas, sem execução).

## Próximo passo

Continuar a revisão de chamadas internas e módulos que gravam auditoria com o autor original ou sem identificar o ator. Priorizar rotas de cliente/portal, venda e estoque, preservando a identidade do cliente separada da identidade de usuário interno.
