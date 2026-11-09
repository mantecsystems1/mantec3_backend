# Lote 12 — referências legíveis nas telas

Data: 08/11/2026. Implementação local no frontend, continuando o [Lote 11](14-implementacao-lote-11.md). Nenhum deploy ou migração foi executado.

## Resultado

Referências sem nome carregado nas telas de OS, orçamento, garantia, venda, pagamento, nota fiscal e painel agora usam uma descrição clara como “Cliente indisponível” ou “Equipamento indisponível”, em vez de despejar um ObjectId ou JSON técnico. A busca e os links continuam usando os identificadores internos por trás da interface.

A lista de pagamentos deixou de mostrar seis caracteres do ID do pagamento como se fossem um número sequencial. Quando a venda não tem número de negócio, a tela diz “Venda sem número”; quando os dados vinculados não puderam ser carregados, deixa isso explícito. A seleção de vendas em formulários fiscais e de garantia também não deriva um número de venda do ID.

Foram corrigidos textos de estado com acentuação e caracteres inadequados em telas de lista/fallback. As mudanças são somente de apresentação; não alteram números de protocolo, contratos, regras financeiras ou dados persistidos.

## Limites

- Os códigos curtos legados de OS e orçamento continuam aparecendo em alguns lugares. Eles não são protocolo garantido. Criar um número único legível para novos registros depende da decisão D8.
- A ficha, documentos, listas fora do fluxo principal e demais referências devem continuar sendo auditados para verificar uso de rótulos legados.
- Nenhuma avaliação de leitor de tela ou uso com clientes reais foi feita.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado; avisos apenas de conversão de finais de linha no Windows. |
| Testes automatizados e navegação visual | Não executados neste lote. |

## Arquivos principais

- `src/utils/operationalDisplay.ts` e referências em páginas de OS, orçamento, garantia, venda, pagamento, fiscal e dashboard.
- `src/modules/financeiro/entities/pagamentos/pages/PagamentosListPage.tsx`.
- `src/modules/fiscal/pages/NotaFiscalFormPage.tsx` e `NotasFiscaisListPage.tsx`.

## Próximo passo

Aplicar o restante seguro de acessibilidade e reflow às telas operacionais, começando por relatórios, cujos grids estão fixos em duas/três colunas e uma linha inteira depende de clique do mouse.
