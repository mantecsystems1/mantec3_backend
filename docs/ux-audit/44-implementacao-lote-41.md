# Lote 41 — retirada mais clara na ficha da OS

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Ao preparar a retirada pelo próprio cliente, o nome preenchido na OS aparece como sugestão. Se a retirada for por terceiro autorizado, o nome sugerido é limpo para evitar registrar a pessoa errada.
- O campo de nome está marcado como obrigatório e oferece preenchimento automático apropriado.
- A área de comprovante não destaca mais uma sequência técnica de hash. O estado do código de integridade aparece em linguagem simples; o valor completo continua acessível sob “Ver detalhe técnico”.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint na página alterada | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 582,00 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
