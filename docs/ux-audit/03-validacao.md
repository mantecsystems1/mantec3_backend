# Validação e registro dos lotes

> Atualização de 08/11/2026: este documento preserva a validação inicial. Resultados posteriores: [Lote 1](04-implementacao-lote-1.md), incluindo a correção financeira, e [Lote 2](05-implementacao-lote-2.md), com ficha, assistente, rascunhos e verificação local no navegador.

Data: 06/11/2026. Raízes BE/FE, mapa e achados no [diagnóstico](01-diagnostico.md); contratos/dados e decisões no [plano](02-plano-implementacao.md).

## Resultado geral

Um primeiro lote de segurança, linguagem, localização nas listas, campos monetários e layout foi implementado nos dois repositórios. **A jornada completa não foi aprovada.** Nenhum deploy, migração ou modificação de banco existente foi executado. Não foi feita inspeção visual real.

“Aprovado” nas tabelas significa apenas que o teste/critério descrito passou. Verificação de HTML em SSR não executa o navegador, não valida preenchimento real, foco ou conformidade WCAG. E2E HTTP existentes usam mocks de serviços/guards em parte dos cenários e não comprovam operação integrada por papel.

## Ambiente e baseline

Dependências locais já instaladas foram utilizadas. FE: React/TypeScript/Vite/Vitest/ESLint; BE: Nest/TypeScript/Jest/ts-jest/Mongoose, `mongodb-memory-server` para integrações. Não foi lido nem usado URI real de `.env` nos testes de banco. Os comandos abaixo foram executados na raiz de cada projeto; logs estão em `evidencias`.

| Requisito/check | Baseline antes do lote | Resultado final | Evidência |
|---|---|---|---|
| FE lint | Aprovado | **Aprovado**, exit0 | `frontend-baseline-lint.log`, `frontend-final-lint.log` |
| FE typecheck | Aprovado | **Aprovado**, exit0 | `frontend-baseline-typecheck.log`, `frontend-final-typecheck.log` |
| FE testes | 3 arquivos / 10 testes aprovados | **6 arquivos / 24 testes aprovados**, exit0 | `frontend-final-test.log` |
| FE build | Aprovado | **Aprovado**, exit0 | `frontend-final-build.log` |
| BE typecheck | Aprovado | **Aprovado**, exit0 | `backend-typecheck-after.log` |
| BE lint:check, sem autofix | 0 erros / 21 avisos | **Aprovado com 21 avisos preexistentes**, 0 erros | `backend-lint.log`, `backend-lint-after.log` |
| BE unitários | 30 suítes / 235 testes aprovados | **30 suítes / 235 testes aprovados** | `backend-unit-after.log` |
| BE E2E HTTP | 2 suítes / 5 testes aprovados | **2 suítes / 5 testes aprovados** | `backend-e2e-after.log` |
| BE tenant real Mongo | Cobertura existente menor | **2 suítes / 14 testes aprovados** | `backend-tenant-after.log` |
| BE criação concorrente de saída estoque | Teste existente executado separadamente | **1/1 aprovado**; não cobre edição/remoção nem reproduzido após complemento de portal (estoque inalterado) | `backend-stock.log` |
| BE build | Aprovado | **Aprovado**, exit0 | `backend-build-after.log` |
| BE integração financeira | **Reprovado: 2 passam / 1 falha**, transação código251 | Não repetida sem mudança pertinente; falha preexistente continua aberta | `backend-integration.log` |
| Reprodução saldo estoque | Defeito reproduzido em banco descartável | **Requisito reprovado**: saída é aceita indevidamente após remover entrada | `backend-stock-repro.log`, `.cjs` |
| Diffs sem erro de whitespace | — | Aprovado nos dois repositórios | `git diff --check` |

Os checks baseline FE foram executados no checkout de trabalho enquanto o agente de comunicação iniciava mudanças; não são uma comparação em worktree isolado. Não se atribui melhoria da baseline ao lote. Os checks finais passaram depois de corrigir erros locais de inferência genérica no teste novo e de regra Fast Refresh na fixture, encontrados na primeira rodada. Não ficaram falhas de lint/tipos/build introduzidas conhecidas.

### Comandos reproduzíveis

```powershell
# Frontend
npm run lint
npm run typecheck
npm test
npm run build

# Backend (lint sem --fix)
npm run typecheck
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:tenant-references
npm run test:estoque-concorrencia
npm run build

# A cadeia existente para na falha de pagamentos; não significa que tenant/estoque falharam.
npm run test:integration

# Reprodução isolada do defeito de estoque, não é uma correção nem teste de aprovação.
node -r ts-node/register docs/ux-audit/evidencias/backend-stock-repro.cjs
```

## Lote A — isolamento de referências

**Antes:** OS/orçamento aceitavam referências de outra empresa em criação/edição; leituras populavam dados sem filtro da empresa. Itens de orçamento podiam apontar produto/serviço externo; o portal podia resolver relações legadas externas.

**Alterado:** `BE/src/ordens-servico/os.service.ts`, `BE/src/orcamentos/orcamentos.service.ts`, `BE/src/portal-cliente/portal-cliente.service.ts`, `BE/test/tenant-client-references.integration.ts`. Reutilizado `assertTenantReference`; populate e buscas de catálogo/fornecedor/equipamento no portal agora têm escopo da empresa; `findByOrcamento` exige empresa. Foram adicionados oito casos ao script de integração existente.

| Critério/cenário | Evidência | Resultado |
|---|---|---|
| Criar/editar OS de A com cliente/técnico/aparelho/orçamento B é recusado | Integração tenant, serviços reais/Mongo descartável | **Aprovado** |
| Criar/editar orçamento e seus itens com referência externa é recusado | Integração inclui produto/serviço e edição | **Aprovado** |
| Referências legítimas da própria empresa continuam aceitas | Casos positivos da mesma integração | **Aprovado** |
| Leitura de relações legadas não revela aparelho/catálogo externo nos cenários testados | Seed direto de vínculo inválido e leitura portal | **Aprovado** |
| Permissões reais por papel e HTTP autenticação com sessão íntegra | Guards unitários existentes; não houve E2E real por papel neste lote | **Não executado de ponta a ponta** |
| Todo endpoint de todos os módulos isolado por empresa | Fora do alcance dessa correção pontual | **Não aprovado por esta auditoria** |

**Compatibilidade:** sem novo schema, estado, migração ou formato de resposta; referências incorretas antes aceitas agora falham. Leitura legada pode retornar relação nula, em vez de dados externos. Na interface tratada, referência não resolvida aparece como indisponível. Não foram apagados/corrigidos vínculos legados; inventário de inconsistências para saneamento futuro precisa ser somente leitura antes de qualquer migração.

## Lote B — listas, linguagem e identificação

**Antes:** tabela genérica sem busca/filtros, sem contexto suficiente nas listas de entrada/OS e com enums crus; seletor de orçamento na OS podia mostrar ID integral.

**Alterado:** `FE/src/components/GenericListPage.tsx`, novo `operational-list.css`, novo `utils/operationalDisplay.ts`, listas de clientes/recebimento/orçamento/OS e `OrdemServicoFormPage.tsx`.

Busca e filtros são opcionais no componente genérico e foram configurados nas quatro listas principais. Usam os registros já carregados e preservam parâmetros na URL (`busca`, `etapa`, `prioridade` ou `situacao`) ao voltar pelo histórico do navegador. Cliente aceita nome, telefone, e-mail/documento; recebimentos procuram nome/aparelho/serial; OS procura nome/aparelho/técnico/referência. Contagem informa explicitamente “registros carregados”. Não há promessa de busca global/paginação no banco.

Recebimentos mostram cliente; OS mostram aparelho, técnico e prioridade. Os rótulos são legíveis; `concluida` aparece “Serviço concluído” e uma OS com dataEntrega aparece “Entregue” na **lista interna**. Nenhum enum persistido foi trocado. Referências Mongo não resolvidas não são apresentadas como nome/JSON nas listas tratadas. O seletor de orçamento usa número existente ou referência curta, com BRL. Isso não cria protocolo único; ainda há sufixos legados em várias telas.

`GenericListPage.test.tsx` adicionou seis cenários, usando SSR e mocks somente da consulta:

| Critério/cenário | Resultado | Limite |
|---|---|---|
| Busca ignora acentos e reconhece telefone com/sem máscara | **Aprovado** | Utilitário sobre dados fornecidos; não busca servidor |
| Busca e etapa da URL se combinam sem alterar coleção | **Aprovado** | SSR, não digitação/Back do navegador |
| Zero resultados mantém controles e orientação para limpar | **Aprovado** | HTML renderizado |
| Sem filtro mantém todos; tabela rolável é focável e cabeçalhos têm escopo | **Aprovado** | HTML; foco real/rolagem não testados |
| Serviço concluído não vira entregue sem data de entrega | **Aprovado** | Somente derivação da lista; portal e detalhe ainda divergentes |
| Relação inválida não mostra ObjectId/JSON e nome/aparelho válido permanece | **Aprovado** | Aplicado ao formatter novo das listas tratadas, não toda UI |

Feedback de erro/sucesso/carregamento da lista recebeu role apropriado; controles novos têm labels e altura mínima44px; área rolável tem foco visível e transições da tabela/botões respeitam movimento reduzido. Essas mudanças não constituem validação de acessibilidade das telas inteiras.

## Lote C — comunicação honesta

**Antes:** o status persistido já era `preparada`, mas o feedback dizia que a mensagem estava aberta/registrada. Abertura de aplicativo/popup pode falhar e não comprova envio.

**Alterado:** helper em `FE/src/modules/comunicacao/clienteComunicacao.service.ts` e feedback nas páginas detalhe de orçamento, OS, venda e garantia. Agora informa: “Mensagem preparada para WhatsApp/e-mail e registrada no histórico. Conclua o envio no aplicativo.” Não foi alterado o canal nem acionado envio real.

Seis testes em `clienteComunicacao.test.ts` cobrem preparação e tenant/cliente, ordem registro→abertura, template/mailto/encoding, falha de registro, falha de sessão e texto sem afirmar envio/abertura. **6/6 aprovados**, ESLint e typecheck aprovados. Logs `frontend-comunicacao-*` e suite final. A origem manual/provedor e confirmação de envio/leitura continuam no plano.

## Lote D — centavos e grids existentes

**Antes:** `ResourceForm` não expunha `step` para number; pagamentos e preço de serviço recebiam o passo padrão inteiro do HTML. Grids inline de OS/recebimento não usavam as classes responsivas existentes.

**Alterado:** `FieldConfig.step` opcional, propagado somente para input number; `PagamentoFormPage.valor` e `ServicoFormPage.precoPadrao` explicitam `0.01`. Quantidade e tempo mantêm o comportamento anterior. Dois testes SSR em `ResourceForm.test.tsx` comparam campos monetários e inteiros. **2/2 aprovados**; submissão nativa de R$10,50 no navegador **não executada**.

OS detalhe usa `resource-grid-layout`; duas seções de recebimento detalhe usam `resource-two-column`, preservando espaçamento. As classes existentes colapsam abaixo de860px. Lint/typecheck/build aprovados; inspeção em360/768/1280px **não executada**. Os três grids são uma melhoria do uso do CSS existente, não prova de ausência de overflow na página toda.

## Cobertura das jornadas obrigatórias

| Jornada/requisito | Evidência obtida | Resultado e pendência |
|---|---|---|
| J1 novo/existente/telefone/duplicata | Modelagem + busca local testada; índice documento por empresa lido | **Parcial**; criação contextual/prevenção de duplicata na UI não executadas |
| J2 entrada completa/interrupção/retomada | Orquestração analisada | **Não aprovado**; sem operação composta nem retomada idempotente |
| J3 diagnóstico/orçamento/decisões/revisão/expiração | Máquinas de estado testadas em unitários; portal/fluxo lidos | **Parcial**; revisão inexistente e validade divergente, browser não executado |
| J4 técnico/peças/espera/troca/atraso | Serviços/state e teste estoque concorrente; reprodução negativa de cache | **Não aprovado como jornada**; estoque divergente e reserva não atômica |
| J5 qualidade/parcial/múltiplos meios/estorno | Integração pagamentos2/3; step SSR | **Reprovado no cenário financeiro existente**; qualidade ausente e status pago declarativo requer decisão |
| J6 aviso/terceiro/acessórios/assinatura/PDF | Preparação mockada aprovada; PDF/entrega analisados | **Parcial**; nenhuma entrega real, terceiros/política e idempotência pendentes |
| J7 sem reparo/recusa/não retirada/reabertura | Modelagem e transições | **Não suportado integralmente**; exige decisões D5–D7 |
| J8 permissões/sessão/rede/retry/concorrência | Guards unitários, tenant real e falhas de preparação testados | **Parcial**; 401/offline/409/duplo envio de atendimento no browser não executados |
| J9 volume/busca/prioridades | Busca/filtros/etapas locais SSR e schema/consultas lidos | **Parcial**; sem benchmark, ordenação e paginação servidor |
| Desktop/tablet/celular, teclado, contraste efetivo/leitor de tela | Tentativa de computer use bloqueada; cálculo estático contraste | **Não executado visualmente**, não aprovado AA |

## Reprodução local e artefatos

Na raiz FE, `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort`; abrir manualmente `/scripts/ux-audit/preview.html`. A fixture substitui o adapter Axios por dados fictícios e não monta autenticação nem chama API real. Opções `?page=/ordens-servico`, `?page=/clientes`, `?page=/orcamentos`, `?error=1` e `?frames=1` ajudam inspeção manual. Executar em localhost; não publicar a fixture como produto. As larguras solicitadas são amostras para revisão, não resultados medidos.

Não foram geradas capturas de antes/depois. O “antes” está comprovado pelo código removido no diff e logs baseline; o “depois” pelos diffs, testes e HTML SSR. A falha da ferramenta de UI foi: **“could not determine the current browser URL on Windows with enough confidence to enforce policy”**. Nenhuma tentativa de contornar a restrição foi feita.

Inventários completos em `evidencias/inventario-frontend.md`, `inventario-backend.md` e extração mecânica `backend-inventario-controllers.json`. Diffs do código rastreado foram salvos em `frontend-lote.patch` e `backend-lote.patch`; arquivos novos de utilitários/testes/CSS/fixture são listados nos próprios repositórios. Logs `.log` permanecem sujeitos ao ignore geral do Git; estão disponíveis localmente, e nenhum commit foi criado.

## Riscos que persistem

Estoque com ledger/cache divergentes, falha transacional de pagamento, status pago declarativo e Pix global impedem uma conclusão de integridade comercial/multiempresa. Entrada e orçamento não são idempotentes; reserva/consumo e entrega não são comandos completos seguros sob falha/repetição; estados/portal e exceções operacionais permanecem incoerentes. Há referências/ações fora do escopo do lote que exigem revisão, além da validação visual e por papel.

O próximo passo é aprovar os lotes estruturais e as decisões do documento02. Melhorias locais feitas aqui não autorizam migrar saldos, contratos, histórico ou assinaturas sem essa confirmação.
