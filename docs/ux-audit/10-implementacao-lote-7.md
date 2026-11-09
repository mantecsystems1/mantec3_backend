# Lote 7 — consultas e ações por perfil

Data: 08/11/2026. Continuação autorizada após o [Lote 6](09-implementacao-lote-6.md). Implementação local, com foco nas telas do fluxo de atendimento e venda. Nenhum deploy ou migração foi executado.

## Resultado

Uma falha de rede, falta de acesso ou resposta inválida não é mais convertida em lista vazia em consultas centrais de clientes, entradas, orçamentos, OS, peças e serviços, vendas, pagamentos, técnicos e garantias. O componente de listagem recebe erro e oferece nova tentativa. Consultas de itens e reservas também deixam de se apresentar como vazias quando o servidor envia um formato inesperado.

As telas que dependem dessas consultas mostram erro claro e impedem seguir com opções incompletas: abertura de OS, venda, pagamento e garantia. Detalhes de OS, orçamento, garantia e cliente oferecem nova tentativa. A mensagem comum distingue sessão expirada, falta de acesso, registro indisponível, conflito e falha temporária.

## Permissões e histórico do cliente

- A resposta do servidor é a fonte efetiva para permissões de interface e eventos. Resposta vazia não recorre às permissões presumidas pelo nome do perfil.
- Enquanto o acesso é conferido, as rotas protegidas aguardam. Se a consulta falha, a tela bloqueia o acesso e oferece nova tentativa; menus e ações ficam fechados.
- O menu informa quando o acesso não pôde ser confirmado ou quando nenhuma área foi liberada. A tela de OS e as ações do orçamento explicam como encaminhar a próxima etapa ao responsável autorizado.
- O histórico do cliente consulta OS, orçamento, venda, garantia e comunicação apenas quando o perfil tem a permissão correspondente. Um erro ou ausência de permissão aparece como “indisponível”, sem converter o caso em zero registros.

## Escopo técnico

Foi criado `normalizeApiList` para validar os formatos de lista aceitos (`[]` ou `{ data: [] }`). Os serviços do escopo deste lote deixam de absorver erros HTTP e retornam erro para a tela, que passa a mostrar uma mensagem ou uma ação de recuperação.

O trabalho concentra-se nas telas do fluxo do cliente e assistência. Alguns módulos fora desse percurso ainda têm consultas próprias que convertem erros em arrays vazios; eles permanecem como trabalho futuro. A autorização final continua no backend; o bloqueio no frontend serve para evitar ações confusas e chamadas desnecessárias.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado; o Git avisou somente sobre conversão de finais de linha no Windows. |
| Testes automatizados | Não executados neste lote. |

Não houve ensaio de navegador com perfis distintos. A tela foi compilada, mas a validação visual da mensagem de acesso e de estados de erro permanece pendente.

## Arquivos principais

- Permissões: `src/contexts/PermissionContext.ts`, `src/contexts/providers/PermissionProvider.tsx`, `src/app/guards/PermissionGuard.tsx`, `src/hooks/useBusinessEvents.ts` e `src/components/layout/Sidebar.tsx`.
- Consultas: `src/services/api/apiList.ts`, `src/hooks/useCRUD.ts`, serviços de cliente, recebimento, OS, orçamento, catálogo, vendas, pagamentos e garantias.
- Jornada: detalhes de cliente, orçamento, OS e garantia; formulários de OS, venda, pagamento e garantia.

## Próximo passo

Conferir em navegador os perfis de técnico, atendimento, vendas e financeiro, principalmente uma resposta de permissões vazia e uma resposta 403. Seguem pendentes as decisões D5–D7 e a migração das consultas semelhantes nos módulos fora do fluxo principal.
