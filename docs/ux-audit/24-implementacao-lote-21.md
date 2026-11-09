# Lote 21 — valores e situações financeiras legíveis

Data: 08/11/2026. Implementação local no frontend, complementando as listas revisadas no [Lote 20](23-implementacao-lote-20.md). Nenhum deploy ou migração foi executado.

## Resultado

Nas listas de vendas e pedidos de compra, os valores agora aparecem com separadores e símbolo de moeda no padrão brasileiro. Um valor ausente ou inválido aparece como “Valor indisponível”; a tela preserva zero quando esse é o valor realmente recebido.

As situações conhecidas também ficaram mais claras: vendas exibem “Pagamento parcial”, “Pendente”, “Pago” ou “Cancelado”; pedidos de compra exibem “Em aberto”, “Recebido” ou “Cancelado”. Dados vazios ou fora dos valores conhecidos são identificados sem expor o token técnico.

## Limites

- Este ajuste é apenas de apresentação. Não altera totais, quitação, validação financeira ou estados persistidos.
- D2 continua pendente para definição das regras de negócio e diagnóstico de dados legados.
- Não houve inspeção visual no navegador nem comparação com respostas financeiras reais.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivos principais

- `src/modules/compras/pages/PedidosCompraListPage.tsx`.
- `src/modules/financeiro/entities/vendas/pages/VendasListPage.tsx`.

## Próximo passo

Revisar o restante das telas da jornada à procura de valores monetários e estados exibidos sem formatação ou rótulo humano. A semântica de qualquer novo estado deverá continuar condicionada à regra de negócio aprovada.
