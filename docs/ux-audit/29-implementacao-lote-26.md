# Lote 26 — OS somente após aprovação do orçamento

Data: 08/11/2026  
Escopo: escolha do usuário para D5 (momento de criação e início da ordem de serviço).  
Situação: implementado localmente, parcialmente no fluxo D5; sem migração e sem publicação.

## Regra aplicada

A OS de execução só pode ser criada a partir de um orçamento aprovado. Ela começa no estado operacional **Aberta**. Cliente e equipamento são derivados do orçamento para evitar vínculos divergentes. A criação direta pela API também aplica a regra, impedindo que uma chamada alternativa crie OS sem orçamento aprovado ou inicie a execução em outro estado.

A ação disponível na lista de OS direciona a pessoa aos orçamentos aprovados. Na tela de criação, a pessoa escolhe o orçamento aprovado e informa os dados operacionais da OS; cliente e equipamento não são pedidos novamente. Quando a OS já foi criada para aquele orçamento, o comportamento existente de idempotência evita criar uma segunda OS pelo mesmo caminho.

## Arquivos envolvidos

- Backend: `src/ordens-servico/os.service.ts`, `src/ordens-servico/dto/create-ordem-servico.dto.ts` e `src/common/bloquear-origem.ts`.
- Frontend: `src/modules/atendimento/ordemServico/pages/OrdensServicoListPage.tsx`, `src/modules/atendimento/ordemServico/pages/OrdemServicoFormPage.tsx`, `src/modules/atendimento/ordemServico/ordensServico.service.ts` e `src/modules/atendimento/orcamento/pages/OrcamentoViewPage.tsx`.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend | Aprovado |
| Lint backend | 0 erros; 19 avisos existentes |
| Build backend | Aprovado |
| Typecheck frontend | Aprovado |
| Lint frontend | Aprovado |
| Build frontend | Aprovado; permanece o aviso existente de bundle acima de 500 kB |
| Testes automatizados e conferência visual no navegador | Não executados nesta etapa |

Os testes que ainda criam OS diretamente sem orçamento aprovado precisam ter seus dados de preparação atualizados antes de serem executados sob a nova regra. A suíte não foi alterada ou executada nesta etapa.

## Limites e continuidade

- Ordens de serviço históricas não foram alteradas; a regra alcança novas criações e alterações de vínculo feitas por esses caminhos.
- Nenhum índice, campo persistido ou migração foi criado.
- Não houve publicação nem conferência visual em navegador.
- D5 continua parcial: a política de exceção administrativa por motivo e as transições de diagnóstico/autorização do reparo não foram inferidas a partir da resposta sobre o momento de criação.
- Próximo fluxo de negócio a definir: orçamento recusado ou reparo não realizado, cobrança eventualmente autorizada, devolução do equipamento e não retirada. Esses caminhos não devem gerar uma venda artificial nem presumir taxa.

