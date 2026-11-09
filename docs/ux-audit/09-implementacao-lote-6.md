# Lote 6 — edição composta de orçamento

Data: 08/11/2026. Continuação autorizada após o [Lote 5](08-implementacao-lote-5.md). Implementação local nos repositórios backend e frontend. Nenhum deploy ou migração em banco existente foi executado.

## Resultado

O detalhe do orçamento permite editar um rascunho completo. A tela carrega cabeçalho e itens salvos, mostra a revisão atual e envia uma única alteração composta. Orçamentos enviados ou em outro estado não podem ser alterados por esta ação.

O backend recalcula subtotal, desconto e total com precisão em centavos, confere cliente, empresa, entrada e referências do catálogo, e grava cabeçalho, itens e auditoria na mesma transação. Se a revisão carregada ficou antiga, a API retorna conflito em vez de substituir a edição mais recente. Se a resposta da gravação for incerta, a tela trava novas alterações até buscar a versão atual do servidor.

## Contrato e jornada

| Rota | Uso |
|---|---|
| `PATCH /orcamentos/:id/completo` | Atualiza rascunho, validade, desconto, observações e 1–100 itens. Exige `ORCAMENTO_EDITAR_RASCUNHO` e a revisão `revisaoEsperada`. |

Totais, situação, cliente e entrada não são aceitos como campos editáveis no comando. O retorno entrega o orçamento atualizado. A edição conserva o status `rascunho`.

No detalhe, o botão “Editar rascunho” aparece apenas para rascunhos e perfis que podem executar o evento. A tela de edição desabilita cliente e entrada, preservando o contexto da proposta. Após conflito, ela carrega a versão mais recente e pede conferência antes de permitir novo salvamento.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck, lint e build | Aprovados; lint sem erros e com avisos preexistentes. |
| Backend: unitários | 33 suítes / 258 testes aprovados na rodada do lote. |
| Backend: integração do orçamento composto | 9 cenários aprovados em Mongo descartável, incluindo corrida de revisões, rollback, permissões HTTP e rejeição de estado não editável. |
| Frontend: typecheck, lint e build | Aprovados; build mantém o aviso de bundle acima de 500 kB. |
| Frontend: testes | 14 arquivos / 84 testes aprovados durante a rodada do lote. |

Não foi feita homologação visual em navegador nem teste com dados de produção. A transação de edição exige suporte a transações Mongo no ambiente de publicação.

## Arquivos principais

- Backend: `src/orcamentos/dto/update-orcamento-completo.dto.ts`, `src/orcamentos/orcamentos.service.ts`, `src/orcamentos/orcamentos.controller.ts`, `src/auditoria/auditoria-eventos.ts` e `test/orcamento-completo.integration.ts`.
- Frontend: `src/modules/atendimento/orcamento/orcamentos.service.ts`, `pages/OrcamentoFormPage.tsx`, `pages/OrcamentoViewPage.tsx` e `src/routes/routes.tsx`.

## Limites e próximo ponto

Este lote cobre edição de rascunho. As regras de aprovação, revisão após envio, cancelamento, reservas e retirada dependem das decisões D5–D7 e continuam pendentes. O próximo ponto de baixo risco é corrigir a distinção entre uma consulta realmente vazia, uma falha de comunicação e uma permissão indisponível.
