# Lote 44 — acompanhamento de OS aguardando retirada

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- Uma OS concluída, paga e ainda sem entrega registrada aparece como “Aguardando retirada” na ficha e na lista.
- Mensagens de status preparadas manualmente podem usar esse estado para avisar o cliente. O sistema não envia mensagens sozinho.
- O filtro de etapa continua consultando os estados oficiais da OS; foi removido o valor “Entregue” que não correspondia a um estado de banco e retornava listas vazias.
- Nenhum status persistido foi criado. O estado de retirada é derivado de conclusão, pagamento confirmado e ausência de registro de entrega.
- Nenhuma cobrança automática foi criada. Prazos ou cadência de lembretes não foram definidos.

## Validação

| Verificação | Resultado |
|---|---|
| Build do frontend (inclui typecheck) | Aprovado |
| ESLint nos arquivos alterados | Aprovado |
| `git diff --check` | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

O build informa que o pacote principal minificado tem 582,50 kB, acima do limite de aviso de 500 kB. Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
