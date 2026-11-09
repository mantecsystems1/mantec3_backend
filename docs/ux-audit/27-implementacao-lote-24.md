# Lote 24 — PDFs sem protocolos derivados de IDs

Data: 08/11/2026. Implementação local no backend, concluindo a revisão iniciada no [Lote 23](26-implementacao-lote-23.md). Nenhum deploy ou migração foi executado.

## Resultado

PDFs de orçamento, recibo, resumo do atendimento e termo de recebimento deixaram de transformar sufixos de ObjectId em códigos `ORC`, `REC`, `ATD`, `OS` e `TRM`. Quando o registro realmente contém um número comercial, ele continua sendo exibido. Sem esse número, o documento não inventa um identificador.

A origem no recibo/resumo passou a usar nomes legíveis, e itens sem cadastro relacionado aparecem como “Produto não identificado” ou “Serviço não identificado”, sem fragmento do ID. Nomes dos arquivos PDF também deixaram de carregar o ObjectId na URL do registro.

## Limites

- O contrato e a política para gerar protocolos oficiais continuam pendentes de D8.
- PDFs ainda podem conter outros estados ou formas de pagamento legados com rótulos técnicos; esta etapa focou identificadores usados como códigos.
- Nenhum PDF foi aberto visualmente neste lote.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck | Aprovado novamente após a etapa de rótulos do Lote 25. |
| Backend: lint:check | Aprovado: 0 erros; 19 avisos preexistentes em outros arquivos. |
| Backend: build | Aprovado novamente após a etapa de rótulos do Lote 25. |
| Testes automatizados e PDF visual | Não executados neste lote. |

## Arquivos principais

- `src/documentos/documentos.service.ts`.
- `src/documentos/documentos.controller.ts`.

## Próximo passo

Renderizar os PDFs com dados de homologação e revisar os rótulos de status e pagamento, preservando pendentes as regras fiscais e de protocolo que exigem definição.
