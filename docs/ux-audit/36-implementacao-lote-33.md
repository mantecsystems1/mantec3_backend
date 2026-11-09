# Lote 33 — checklist de qualidade antes da conclusão da OS

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou migração de dados.

## Fluxo na OS

Durante a execução, o responsável registra os resultados dos sete testes-base:

- Liga e desliga
- Tela e toque
- Botões
- Câmeras
- Áudio e microfone
- Conexões
- Carregamento

Cada item aceita “Aprovado”, “Falha” ou “Não se aplica”. Uma falha exige observação com ao menos cinco caracteres. “Não se aplica” pode ter justificativa opcional. Os itens podem ser salvos parcialmente e retomados depois. O contador mostra quantos já foram registrados.

A OS só pode ser concluída quando todos os sete itens tiverem exatamente um resultado e nenhum permanecer como falha. Se um teste falhou e depois passou no reteste, o responsável altera o resultado e salva novamente; a gravação anterior permanece descrita no histórico. A tela bloqueia a conclusão quando há alterações locais ainda não salvas, e a API aplica a mesma validação para evitar que outro cliente contorne a interface.

Ao concluir, o checklist fica somente para consulta no detalhe da OS. Registros antigos já concluídos sem checklist continuam acessíveis, com indicação de que foram finalizados antes desta etapa.

## Persistência e histórico

- Novo comando `PATCH /ordens-servico/:id/checklist-qualidade`, protegido pelo evento de permissão de conclusão da OS, aceita somente OS em execução e itens da lista autorizada.
- Falhas pedem observação; os textos são aparados e limitados a 500 caracteres.
- Uma revisão crescente protege contra gravação concorrente. Se outra sessão salvar antes, o comando retorna conflito para recarregar a OS.
- Cada salvamento registra evento de auditoria com autor, itens anteriores e atuais, quantidades e número de revisão. A tela da linha do tempo traduz o evento e seus campos.
- Os campos são opcionais/aditivos para documentos existentes. Não há backfill.

## Limites assumidos

Este é um checklist-base para diversos equipamentos, não uma matriz por categoria ou modelo. O operador marca como “Não se aplica” o que o equipamento não possui. Uma falha impede a conclusão até o reparo e reteste serem registrados como aprovados ou não aplicáveis.

Depois da conclusão, o checklist é somente leitura. Correções posteriores, reabertura, autorização especial e um comprovante externo versionado não foram definidos nem implementados. A revisão e os snapshots do evento preservam alterações feitas enquanto a OS está em execução, mas não substituem uma política de correção de registros concluídos.

## Arquivos principais

- Backend: `src/ordens-servico/schemas/ordem-servico.schema.ts`, `src/ordens-servico/dto/registrar-checklist-qualidade.dto.ts`, `src/ordens-servico/os.controller.ts`, `src/ordens-servico/os.service.ts` e `src/auditoria/auditoria-eventos.ts`.
- Frontend: `src/modules/atendimento/ordemServico/checklistQualidade.ts`, `ordensServico.service.ts`, `pages/OrdemServicoDetailPage.tsx` e `src/modules/auditoria/components/AuditTimeline.tsx`.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos já existentes |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; chunk principal do frontend com 567,89 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de LF para CRLF |

Testes automatizados e conferência manual no navegador não foram executados nesta etapa. Nenhuma migração de dados, alteração em registros ou publicação foi feita.
