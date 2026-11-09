# Lote 40 — próxima ação clara após aprovação do orçamento

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Quando o orçamento está aprovado e o atendimento ainda permite reparo, a ação principal passou de “Criar OS” para “Iniciar reparo”.
- Um texto curto explica que essa ação abre a ordem de serviço para diagnóstico e execução. A OS continua sendo criada com estado inicial “Aberta”, conforme a regra já aprovada.
- O aviso de falha ao executar uma ação no orçamento agora é anunciado por leitor de tela.
- As condições de disponibilidade da ação não mudaram: depende da aprovação e fica oculta no caminho encerrado sem reparo.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint na página alterada | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 581,67 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
