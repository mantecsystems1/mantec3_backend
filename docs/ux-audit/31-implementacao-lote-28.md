# Lote 28 — autorização e assinatura na retirada

Data: 08/11/2026  
Decisão confirmada pelo usuário: permitir retirada pelo cliente ou por terceiro autorizado; registrar autorização, nome e assinatura.  
Situação: implementado localmente, parcialmente em D7; sem migração e sem publicação.

## Fluxos cobertos

A regra vale para os dois tipos de retirada:

- **Após reparo:** entrega registrada na OS concluída, depois da conferência de pagamento que o fluxo já exigia.
- **Sem reparo:** devolução registrada na entrada do equipamento, sem criar venda ou cobrança.

Em ambos, a pessoa operadora escolhe se quem recebe é o cliente ou um terceiro autorizado, informa o nome de quem está presente e coleta a assinatura na tela. Para terceiro, também precisa confirmar que o cliente vinculado autorizou a retirada. O backend exige essa confirmação e grava o vínculo ao cliente da OS/entrada, o tipo de recebedor, a confirmação, a data de autorização e os dados de auditoria de quem registrou.

As assinaturas são armazenadas como imagem base64 e acompanhadas por hash SHA-256, data, IP e agente do navegador obtidos da requisição. A mesma retirada não cria eventos repetidos; tentativas com dados diferentes são recusadas para preservar o comprovante. O detalhe da entrada e da OS mostra quem recebeu, se era terceiro, o estado da confirmação e a assinatura correspondente. A linha do tempo identifica o tipo de recebedor e a confirmação sem exibir a imagem bruta.

## Arquivos envolvidos

- Backend: DTOs de entrega da OS e devolução da entrada; schemas de OS e recebimento; controllers de OS e recebimento; serviços `OsService` e `RecebimentoEquipamentoService`; ficha de atendimento e eventos de auditoria.
- Frontend: `OrdemServicoDetailPage.tsx`, `ordensServico.service.ts`, `RecebimentoDetailPage.tsx`, `recebimento.service.ts`, ficha do atendimento e `AuditTimeline.tsx`.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend | Aprovado |
| Typecheck frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos já existentes |
| Lint frontend | Aprovado |
| Build backend | Aprovado |
| Build frontend | Aprovado; aviso existente de bundle principal acima de 500 kB (547 kB) |
| Testes automatizados e conferência visual no navegador | Não executados nesta etapa |

## Limites e continuidade

- Campos novos são opcionais nos documentos existentes; nenhuma migração foi feita. Novas retiradas precisam informar o tipo de recebedor.
- Retiradas históricas não receberam retroativamente a classificação cliente/terceiro; quando o tipo está ausente, a tela identifica como dado legado não registrado.
- A confirmação de autorização por terceiro é uma declaração registrada pelo operador autenticado e vinculada ao cliente do atendimento; não é um aceite digital do cliente.
- A assinatura é desenhada na tela; política para situações sem dispositivo apontador, checklist por tipo de aparelho e correções versionadas do comprovante seguem pendentes.
- Não houve publicação. Os dois projetos devem ser publicados juntos após revisão e validação operacional.

