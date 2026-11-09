# Lote 46 — cadastro de cliente sem abandonar o recebimento

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Se não houver correspondência na lista filtrada, a tela oferece cadastro do cliente em uma nova aba somente para perfis que podem administrar clientes.
- O formulário de recebimento permanece aberto na aba original, com campos e rascunho preservados.
- Depois do cadastro, a pessoa pode atualizar a lista de clientes sem reiniciar a entrada; a busca atual continua aplicada.
- Se não houver cliente ativo cadastrado e a busca estiver vazia, a tela explica a situação e mostra as mesmas ações.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint na página alterada | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 584,54 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
