# Lote 39 — busca de listas sem consultas a cada tecla

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Listas que usam paginação no servidor esperam 300 ms após a última tecla antes de disparar uma busca.
- Consultas pendentes são canceladas quando a pessoa continua digitando, limpa filtros ou navega para outra busca.
- O novo termo é aplicado sobre os filtros atuais e reinicia a lista na primeira página.
- O campo acompanha a busca na URL, então recarregar ou compartilhar a página continua preservando o filtro aplicado.
- Listas locais continuam filtrando sem atraso.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint nos dois componentes alterados | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 581,40 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
