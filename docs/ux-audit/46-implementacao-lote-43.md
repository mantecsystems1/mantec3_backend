# Lote 43 — avisos da OS acessíveis

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Erros de ação na ficha da OS são anunciados como alerta.
- Confirmações de comunicação e pendências que impedem a retirada são anunciadas como mensagens de estado.
- A regra financeira que condiciona a retirada não foi alterada.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint na página alterada | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 582,26 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
