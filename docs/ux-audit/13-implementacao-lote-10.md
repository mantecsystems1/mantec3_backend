# Lote 10 — rotas antigas e contexto de navegação

Data: 08/11/2026. Implementação local no frontend, continuando o [Lote 9](12-implementacao-lote-9.md). Nenhuma rota foi removida.

## Resultado

A rota antiga `/recebimentos/:id/editar` não apresenta mais a tela de consulta como se fosse uma edição. Ela redireciona ao detalhe do recebimento e mostra uma explicação com orientação para correção. A mensagem pode ser fechada sem perder o registro.

A ficha em `/atendimentos/:recebimentoId` agora aparece como “Ficha de atendimento” no contexto superior, em vez de ser identificada como página inicial. Endereços inexistentes mostram uma página acessível com ações de voltar e ir ao início.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros ou avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado; avisos somente de conversão de finais de linha no Windows. |
| Testes automatizados e navegação visual | Não executados neste lote. |

## Limites e próximo passo

O formulário de edição de recebimento continua indisponível; este lote explica a rota antiga, sem inventar uma edição parcial de dados com anexos, termo e auditoria. As outras rotas legadas ainda precisam ser revisadas quanto a uso antes de qualquer remoção.

O próximo trecho seguro é garantir que indicadores mostrem “indisponível” quando a leitura falhar, preservando as definições de negócio ainda pendentes.
