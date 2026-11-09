# Lote 23 — IDs fora de comprovantes e comunicações

Data: 08/11/2026. Implementação local no frontend, complementando a revisão de referências das [listagens](23-implementacao-lote-20.md) e da tela fiscal ([Lote 22](25-implementacao-lote-22.md)). Nenhum deploy ou migração foi executado.

## Resultado

Comprovante de pagamento não exibe mais o ObjectId do registro financeiro. Venda e garantia usam o número de negócio quando existe e indicam “sem número” quando a API não o fornece. Os vínculos de garantia com venda e OS também não usam IDs como substitutos.

Mensagens preparadas para clientes não incluem sufixos do ObjectId como se fossem números de recibo, ordem de serviço ou garantia. Os estados de OS e garantia usados no texto passam por rótulos conhecidos em português, com alternativa segura para valores não reconhecidos.

## Limites

- Protocolo oficial/único continua pendente de decisão D8; este lote não inventa nem persiste um identificador substituto.
- A tela interna de OS ainda pode mostrar uma referência curta explicitamente marcada como legada.
- Não houve validação visual, geração de PDF real ou verificação de cada template externo.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivos principais

- `src/modules/financeiro/entities/vendas/pages/VendaDetailPage.tsx`.
- `src/modules/financeiro/entities/pagamentos/pages/PagamentoDetailPage.tsx`.
- `src/modules/atendimento/garantia/pages/GarantiaDetailPage.tsx`.
- `src/modules/atendimento/ordemServico/pages/OrdemServicoDetailPage.tsx`.

## Próximo passo

Revisar PDFs e mensagens já geradas para confirmar que não reutilizam IDs internos como números externos. Em seguida, seguir com os ajustes locais que não dependam das decisões D5–D11.
