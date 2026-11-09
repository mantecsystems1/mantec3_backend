# Lote 16 — autoria em itens de venda

Data: 08/11/2026. Implementação local no backend, continuando a revisão de rastreabilidade dos [Lotes 9 e 15](18-implementacao-lote-15.md). Nenhum deploy ou migração foi executado.

## Resultado

Os endpoints autenticados de itens de venda agora encaminham o usuário da sessão ao serviço. Inclusão, alteração e remoção direta de um item gravam um evento `VENDA_ATUALIZADA` associado à venda, com a identidade de quem realizou a ação e detalhes objetivos do item/quantidade/valor.

Se o item for transferido entre vendas, o histórico da venda de origem registra a retirada e o da venda de destino registra o recebimento. O evento é gravado dentro da mesma transação da alteração e do recálculo de totais.

Itens incluídos como parte de uma venda composta continuam cobertos pelo evento da operação completa; não são duplicados como eventos avulsos.

## Limites

- Chamadas internas sem ator permanecem compatíveis e não registram autoria de item.
- A trilha não altera valores, pagamentos, estoque ou o cálculo do total da venda.
- Não houve teste integrado de transação nem verificação do evento na tela de auditoria.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck | Aprovado. |
| Backend: lint de CI | 0 erros; 19 avisos existentes. |
| Backend: build | Aprovado. |
| Testes automatizados | Não executados neste lote. |

## Arquivos principais

- `src/financeiro/vendas/vendas.controller.ts`.
- `src/financeiro/vendas/vendas.service.ts`.
- `src/auditoria/auditoria-eventos.ts` (usa o evento existente `VENDA_ATUALIZADA`).

## Próximo passo

Continuar a revisão de autoria em serviços chamados fora de HTTP e verificar a apresentação dos novos detalhes na linha do tempo. Aprovação/recusa pelo portal ainda exige distinguir a pessoa cliente do usuário interno; essa identidade não deve ser gravada no campo de usuário sem um contrato apropriado.
