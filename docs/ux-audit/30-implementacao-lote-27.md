# Lote 27 — devolução sem reparo e sem cobrança automática

Data: 08/11/2026  
Decisão confirmada pelo usuário: registrar “Sem reparo”, informar o motivo e devolver o equipamento sem gerar venda ou taxa automaticamente.  
Situação: implementado localmente; sem migração e sem publicação.

## Fluxo aplicado

1. Na entrada do equipamento, a pessoa autorizada escolhe **Encerrar sem reparo** e informa um motivo.
2. O sistema prepara a devolução, com situação **Devolução pendente**. O resultado técnico e a posse do equipamento são campos separados.
3. Quando o aparelho for retirado, a pessoa registra o nome de quem recebeu e uma observação opcional. O sistema grava a data, quem registrou e muda a situação para **Devolvido sem reparo**.
4. A ficha e a lista de entradas mostram o resultado, o estado da retirada e a situação financeira **Sem cobrança**.

O caminho não cria venda, pagamento ou taxa. Ele só prossegue quando não há orçamento em rascunho/em envio nem OS não cancelada vinculada. Se houver venda vinculada ao orçamento ou à OS, a ação pede regularização financeira antes da devolução. Criações posteriores de orçamento ou OS para a entrada encerrada são recusadas.

## Integridade e histórico

- Os dados de encerramento e devolução são aditivos e opcionais no documento MongoDB de recebimento; não foi feita migração nem alteração de registros históricos.
- As ações usam transação e bloqueiam o recebimento como origem para evitar uma OS/orçamento concorrente com o encerramento.
- A repetição da mesma ação retorna o registro existente; mudanças posteriores exigem correção por pessoa responsável.
- A entrada com resultado/devolução registrado não pode ser excluída.
- O histórico recebe eventos próprios para encerramento sem reparo e devolução registrada.

## Escopo ainda pendente

A entrega simples guarda o nome de quem recebeu, a data e observações. Assinatura, autorização para retirada por terceiros, comprovante versionado, prazos de não retirada e garantia continuam fora deste lote e dependem de D7 e das regras seguintes. Se houver orçamento/OS em aberto, ele precisa ser encerrado antes; venda já existente exige conferência financeira, não cancelamento automático.

## Arquivos envolvidos

- Backend: `src/common/bloquear-origem.ts`, `src/ordens-servico/os.service.ts`, `src/orcamentos/orcamentos.service.ts`, `src/recebimento/recebimento-equipamento/recebimento-equipamento.controller.ts`, `src/recebimento/recebimento-equipamento/recebimento-equipamento.service.ts`, `src/recebimento/recebimento-equipamento/recebimento-equipamento.schema.ts`, `src/recebimento/recebimento-equipamento/recebimento-fluxo.ts`, DTOs de encerramento/devolução, `src/auditoria/auditoria-eventos.ts` e `src/atendimentos/atendimentos.service.ts`.
- Frontend: `src/modules/atendimento/recebimento/recebimento.service.ts`, telas de lista e detalhe da entrada, ficha do atendimento, serviço/tipos da ficha, tela do orçamento, `src/modules/auditoria/components/AuditTimeline.tsx`, `src/utils/operationalDisplay.ts` e `src/constants/business-events.constants.ts`.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend | Aprovado |
| Typecheck frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Lint frontend | Aprovado |
| Build backend | Aprovado |
| Build frontend | Aprovado; permanece o aviso de bundle acima de 500 kB (541 kB) |
| Testes automatizados e conferência visual no navegador | Não executados nesta etapa |

