# Lote 25 — estados e meios de pagamento legíveis nos PDFs

Data: 08/11/2026. Implementação local no backend, dando sequência à revisão de documentos do [Lote 24](27-implementacao-lote-24.md). Nenhum deploy ou migração foi executado.

## Resultado

Orçamentos, recibos, resumos de atendimento e termos mostram nomes legíveis para os tipos de item, estados operacionais/financeiros conhecidos e formas de pagamento. Tokens como `em_execucao`, `cartao_credito` e `parcial` aparecem como “Serviço em execução”, “Cartão de crédito” e “Pagamento parcial”. No resumo, a etapa do serviço também considera a data de entrega confirmada: um equipamento entregue aparece como “Entregue”, mesmo que o status operacional legado ainda seja “concluída”. Valores e regras financeiras não foram alterados.

## Limites

- O mapa de rótulos cobre os estados e meios de pagamento observados no backend; valores novos recebem formatação genérica e precisam de manutenção.
- Não foi renderizado um PDF com dados de homologação para inspeção visual.
- As estimativas fiscais fictícias foram tratadas no Lote 22; este lote não calcula tributos.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck | Aprovado. |
| Backend: lint:check | Aprovado: 0 erros; 19 avisos preexistentes em outros arquivos. |
| Backend: build | Aprovado. |
| Testes automatizados e PDF visual | Não executados neste lote. |

## Arquivo principal

- `src/documentos/documentos.service.ts`.

## Próximo passo

Revisar comprovantes gerados visualmente com dados sem informação sensível e conferir estados menos comuns. Novos protocolos, regras de entrega, assinatura e políticas financeiras continuam aguardando decisões específicas.
