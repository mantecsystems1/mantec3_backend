# Lote 20 — referências legíveis em vendas e compras

Data: 08/11/2026. Implementação local no frontend, na sequência da revisão de referências iniciada no [Lote 12](15-implementacao-lote-12.md). Nenhum deploy ou migração foi executado.

## Resultado

As listas de vendas e de pedidos de compra agora apresentam o nome do cliente ou fornecedor quando a API entrega o registro relacionado. Se a relação vier somente como ObjectId, a tela mostra “Cliente indisponível” ou “Fornecedor indisponível”, em vez de exibir dezenas de caracteres técnicos.

Foi revisado o restante das páginas de listagem. Recebimentos, garantias, pagamentos, notas fiscais, OS e orçamentos já usam rótulos de relação ou deixam referências legadas explicitamente marcadas; IDs continuam presentes nos dados e nas rotas para uso interno.

## Limites

- Quando a API retorna somente um identificador e não popula a relação, não há nome disponível para a lista; este lote evita expor o ID, mas não altera o contrato de consulta.
- OS e orçamentos ainda mostram referências legadas curtas devidamente identificadas, enquanto não existe protocolo comercial aprovado.
- Não houve validação visual no navegador nem teste com respostas de API por perfil.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivos principais

- `src/modules/financeiro/entities/vendas/pages/VendasListPage.tsx`.
- `src/modules/compras/pages/PedidosCompraListPage.tsx`.

## Próximo passo

Conferir nos endpoints de leitura se as relações autorizadas são populadas com nomes sem ampliar dados entre empresas. Depois, seguir para os demais itens locais e reversíveis do plano, mantendo pendentes as decisões de negócio que exigem definição.
