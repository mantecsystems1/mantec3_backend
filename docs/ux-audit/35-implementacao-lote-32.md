# Lote 32 — indicadores separados e prazo combinado

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação, migração ou preenchimento de dados existentes.

## Painel financeiro

O painel agora separa:

- **Vendas não canceladas:** soma acumulada dos registros ativos, identificada como venda registrada e não como nota fiscal.
- **Recebido confirmado:** acumulado de pagamentos válidos, exibido somente a quem tem permissão para consultar pagamentos.
- **Vendas canceladas:** quantidade e valor original, fora do total de vendas não canceladas.

O resumo de recebimentos vem de `GET /pagamentos/resumo-painel`, limitado à empresa e protegido pela permissão `PAGAMENTO_CONSULTAR`. Ele reutiliza a regra financeira existente: pagamentos legados sem vínculo de caixa continuam válidos; pagamentos vinculados só entram quando o movimento está confirmado e corresponde ao pagamento e ao valor. Não soma registros de venda cancelados.

Os totais são acumulados de todo o histórico disponível, sem filtro por período. A lista de vendas para os totais de vendas/cancelamentos ainda é carregada pelo painel no frontend. Não foi feita análise de desempenho com volume grande.

## Previsão de entrega e atraso

- A OS passou a aceitar `dataPrevistaEntrega` opcional, quando o prazo foi combinado com o cliente. Pode ser registrada na criação ou alterada enquanto a OS está ativa.
- Alterações ficam na auditoria com autor e datas anterior/nova. A interface orienta a avisar o cliente quando a previsão muda; a comunicação continua manual.
- A data aparece no detalhe da OS e no portal do cliente.
- Uma OS só conta como atrasada quando continua ativa e a previsão é anterior ao dia atual em `America/Sao_Paulo`. Uma previsão para hoje ainda está dentro do prazo.
- OS ativas sem data combinada são mostradas como “sem previsão” e não viram atraso pela data de entrada. A lista de atrasos mostra até cinco OS e permite abrir cada ficha.

OS históricas não recebem datas inventadas. Cada previsão antiga precisa ser registrada por uma pessoa da assistência se houver comprovação do prazo combinado.

## Arquivos principais

- Backend: `src/financeiro/pagamentos/pagamentos.controller.ts`, `pagamentos.service.ts`, `src/financeiro/vendas/venda-pagamentos-validos.ts`, `src/ordens-servico/schemas/ordem-servico.schema.ts`, `dto/create-ordem-servico.dto.ts`, `os.service.ts` e `src/auditoria/auditoria-eventos.ts`.
- Frontend: `src/modules/dashboard/dashboard.service.ts`, `pages/DashboardPage.tsx`, `components/StatCard.tsx`, `src/modules/atendimento/ordemServico/pages/OrdemServicoFormPage.tsx`, `OrdemServicoDetailPage.tsx` e `src/modules/auditoria/components/AuditTimeline.tsx`.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; pacote principal do frontend com 561,02 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de LF para CRLF |

Testes automatizados e conferência manual no navegador não foram executados nesta etapa. Nenhuma migração, backfill ou publicação foi realizada.

