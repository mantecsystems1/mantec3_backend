# Implementação do Lote 1 — integridade e retomada

> Continuação: o [Lote 2](05-implementacao-lote-2.md) acrescentou a ficha interna, o assistente e autosave antes do primeiro envio. Os limites abaixo descrevem o fechamento deste Lote 1, não substituem os resultados posteriores.

Atualização: **08/11/2026**. Escopo autorizado: decisões **D1–D4** do [plano](02-plano-implementacao.md), após o pedido de começar a implementação. Este documento registra o estado posterior ao diagnóstico e à validação inicial de 06/11. Os arquivos anteriores continuam como evidência da baseline.

As alterações estão nos dois checkouts locais. Não houve deploy, transferência financeira, envio de mensagem, migração de dados reais ou reconciliação em massa de saldos. Testes de banco usaram MongoDB descartável. A configuração de Pix não confirma titularidade no DICT/banco: o operador deve conferir o beneficiário no aplicativo bancário.

## O que mudou para a operação

| Área | Antes | Comportamento implementado |
|---|---|---|
| Estoque | Excluir/editar movimento podia alterar o saldo mostrado sem alterar o saldo usado para aceitar saídas | Eventos originais preservados; edição gera compensação e substituição, exclusão gera estorno. Ledger e cache são validados na mesma transação, com bloqueio por produto e rejeição de saldo negativo/reserva inconsistente. |
| Compras | Sincronização escrevia/excluía movimentos diretamente; edição de item recebido não atualizava estoque em todos os caminhos | Sincronização passa pelo serviço de estoque e participa da transação do pedido/itens. Falha de estorno por peça consumida desfaz a alteração da compra. |
| Pagamentos | Editar/estornar podia colidir com chave histórica do caixa e abortar a transação; venda podia declarar manualmente que estava paga | Cada revisão de lançamento tem chave própria e preserva o histórico. Quitação é derivada de pagamentos válidos; alteração manual incompatível é recusada. Caixa, título, pagamento e venda participam da transação. |
| Retirada/documentos/portal | Cache de venda marcado pago podia divergir dos recebimentos ou incluir valores estornados | A retirada confere pagamentos válidos sob bloqueio da venda; portal, consultas de venda e PDFs de recibo/atendimento usam a mesma regra de pagamento. |
| Pix | Portal usava chave e imagem QR globais fixas | Administrador configura chave e beneficiário da própria empresa; portal mostra somente essa configuração. Sem configuração válida, orienta contato com a assistência. |
| Recebimento | Cabeçalho, condições, faltantes e termo eram gravados por chamadas independentes; retry podia cadastrar de novo | Comando composto grava os dados juntos e identifica a operação por chave. Arquivos pendentes ficam visíveis e podem ser reenviados sem criar outro recebimento. |

## D1 — estoque e compras

Arquivos centrais: `src/estoque/estoque.service.ts`, `schemas/movimento-estoque.schema.ts`, `src/compras/compras.service.ts` e módulo, `test/estoque-concorrencia.integration.ts`; FE `modules/estoque/estoque.service.ts` e `pages/MovimentosEstoquePage.tsx`.

O serviço passa a calcular a disponibilidade a partir de todos os eventos do ledger, incluindo compensações. Cada mutação bloqueia os produtos envolvidos em ordem estável, valida o resultado e atualiza `SaldoEstoque` na mesma transação. Um cache antigo divergente deixa de ser a autorização para saída; a operação verifica o ledger. Uma transação externa é reaproveitada, evitando confirmação parcial em compras/financeiro.

Movimentos mantêm os campos originais imutáveis e recebem metadados opcionais: `estornoDeId`, `estornoId`, `estornadoEm`, `substituiId`, `substituidoPorId`. O histórico permanece em GET como array; a interface identifica Registrado, Substituído, Estornado e Compensação.

**Compatibilidade de PATCH/DELETE:** PATCH retorna o novo movimento substituto, com novo `_id`; consumidores devem usar o ID retornado. Consultar o ID anterior resolve a cadeia de substituição. Edição conflitante de um evento já substituído retorna conflito; uma repetição equivalente não duplica a substituição. DELETE estorna o evento em vez de apagá-lo; repetir o mesmo DELETE não gera outro estorno. IDs antigos não devem ser tratados como autorização para apagar eventos posteriores. Integrações externas que presumem `_id` invariável após PATCH precisam revisar essa suposição antes da publicação.

Há diagnóstico somente de leitura em `docs/ux-audit/evidencias/lote1-estoque-diagnostico.cjs`, exigindo empresa e nome explícito de variável de conexão. Ele não carrega `.env`, não cria índices/coleções e não corrige registros. Não foi executado contra banco existente. Uma eventual reconciliação em massa continua exigindo relatório e aprovação do ambiente/dados.

**Critérios executados:** 18 cenários de integração cobrem saídas concorrentes, edição de quantidade/produto, evento já consumido, dois estornos, edição conflitante, tenant, rollback de auditoria e transação externa, cache divergente, reserva/liberação, compra recebida/alteração de item/cancelamento, sincronização concorrente e preservação das compensações. Na integração de compras, estoque e compras são reais; o financeiro administrativo foi substituído para isolar esse escopo.

## D2 — pagamentos, quitação e comprovantes

Arquivos centrais: `src/financeiro/vendas/venda-pagamentos-validos.ts`, `vendas.service.ts`, `src/financeiro/pagamentos/pagamentos.service.ts`, `financeiro-adm.service.ts`, `src/ordens-servico/os.service.ts`, `src/portal-cliente/portal-cliente.service.ts`, `src/documentos/documentos.service.ts`; FE formulário de venda/pagamento e tipo de venda.

A falha original de edição/remoção foi isolada: o lançamento novo reutilizava a chave de idempotência única de um movimento anterior estornado. O histórico não é apagado para liberar a chave. Uma revisão do lançamento usa uma chave distinta, e uma falha intermediária desfaz a operação.

A função compartilhada de pagamentos válidos considera valores positivos. Pagamento com vínculo ao caixa só conta quando o movimento está confirmado e corresponde à mesma empresa, origem e valor. **Compatibilidade:** pagamentos legados sem vínculo de caixa continuam contando; isso não é uma certificação de todo o histórico legado. Leituras de venda acrescentam `totalPago` e `saldoRestante`, em reais, e derivam o status sem migrar registros antigos.

Criar uma venda como `pago`/`parcial` ou alterar o status para um valor incompatível com os pagamentos passa a ser recusado com mensagem explícita. A tela de criação não pede mais essa declaração manual. Reduzir o total abaixo do valor já recebido também falha sem persistir itens/totais pela metade. Venda e pagamento usam a mesma trava de concorrência da venda.

Na retirada, a checagem financeira e o registro/auditoria estão em transação e usam a venda como ponto de serialização com pagamentos/estornos. Não foi mudada a política atual de exigir quitação integral. Não foram criadas regras de crédito, taxa zero, entrega a prazo, terceiro ou devolução sem reparo. A idempotência e o versionamento próprios do comprovante de retirada continuam no lote de estados/entrega; ainda não é correto afirmar que toda repetição da entrega é protegida.

O portal filtra pagamentos estornados ou vinculados a caixa externo. Os PDFs de recibo/atendimento também derivam situação e valores de pagamentos válidos, para não apresentar uma quitação baseada apenas no cache antigo. Testes dos PDFs inspecionam o conteúdo gerado; não houve inspeção visual das páginas.

**Critérios executados:** 17 cenários de integração financeira incluem o caso original, parcial, centavos/meios distintos, estorno, edição sucessiva, rollback, transação externa, concorrência entre alteração de total e pagamento, contexto sem empresa e bloqueio de retirada por cache forjado/estorno. O portal tem cenário adicional de pagamentos válidos/estornados/externos em sua integração. Unitários de documentos verificam pendente/parcial no recibo.

## D3 — Pix configurável por empresa

Novos contratos aditivos: `PATCH /empresas/minha/pix` para administrador da própria empresa; `PATCH /empresas/:id/pix` para administrador de plataforma. Ambos mantêm a autorização no backend. O endpoint genérico de empresa não pode ser usado para alterar Pix por campos aninhados/operadores.

Schema `Empresa.pix` é opcional. Configuração habilitada exige tipo/chave, nome e cidade do beneficiário, com validação local dos formatos. Desabilitar remove a chave da configuração pública. O evento `EMPRESA_PIX_ATUALIZADO` guarda ator, beneficiário e hash da chave; a gravação e a auditoria são transacionais. Não existe default derivado do CNPJ global nem migração automática do destino anterior.

No FE há painel específico em Minha Empresa, restrito aos administradores correspondentes. O portal recebe `empresa.pix` apenas com os campos públicos necessários, ou `null`. O botão de copiar usa Clipboard com feedback real de sucesso/falha. **Nesta versão o pagamento é por chave copiável e beneficiário informado; não foi implementada geração de QR nem aceite de URL arbitrária de QR.** O QR global deixou de ser exibido pelo portal. A confirmação de pagamento continua sendo registro financeiro autorizado, não clique no botão copiar.

Arquivos novos incluem `src/core/empresa/pix-empresa.ts`, DTO e testes; FE `modules/empresas/PixConfigurationPanel.tsx`, `pixEmpresa.ts`, CSS, `portalCliente/components/PortalPixCard.tsx` e testes.

**Critérios executados:** 16 testes unitários de formato/estado e 7 integrações HTTP/Mongo de configuração A/B, sem sessão/sem permissão, alvo externo, payload inválido, rollback de auditoria, plataforma/desativação e estado financeiro do portal. O backend de configuração/auditoria e a guarda de evento foram exercitados; autenticação usa fixture nos testes, sem credencial real. Testes FE cobrem conteúdo A/B, ausência e erro de cópia. Não houve consulta DICT, transferência ou validação bancária de beneficiário.

## D4 — entrada composta e recuperação de anexos

O novo fluxo é aditivo; endpoints CRUD anteriores permanecem disponíveis. O frontend atualizado utiliza o comando composto e não faz fallback silencioso para a sequência antiga se o backend novo estiver indisponível.

| Método/rota | Finalidade |
|---|---|
| `POST /recebimento-equipamento/completo` | Corpo com `operacaoId` UUID, recebimento, condições/faltantes/termo, manifesto de arquivos e links de mídia; grava o conjunto de dados e auditoria em transação |
| `GET /recebimento-equipamento/completo/operacoes/:operacaoId` | Recupera resultado de operação da empresa/operador autenticado, inclusive quando a resposta anterior foi perdida |
| `GET /recebimento-equipamento/completo/pendentes` | Lista até 50 entradas com arquivos pendentes do operador, em ordem recente |
| `GET /recebimento-equipamento/completo/:id` | Consulta entrada composta por empresa, incluindo anexos faltantes |
| `POST /recebimento-equipamento/completo/:id/confirmar` | Confirma depois de conferir todas as chaves/hashes esperados; repetir confirmação não duplica o evento |
| `POST /midias-recebimento/upload` | Contrato existente com `chaveCliente` opcional para upload idempotente do novo fluxo; bytes têm hash calculado pelo servidor |

A unicidade é por empresa+operador+operação. Repetir mesma chave/conteúdo retorna a mesma entrada; conteúdo diferente gera409 e não sobrescreve. A assinatura e o termo têm hashes calculados no servidor, data/IP/navegador são tratados como metadados do evento e não alteram a identidade do payload em retentativa. Termo e criação mantêm eventos de auditoria na transação.

Novos campos opcionais do recebimento: chave/hash privados da operação, `estadoSalvamento` (`pendente_midias`/`confirmado`) e manifesto de arquivos esperados. Não são novos estados técnicos de reparo. Mídia ganha chave opcional com índice único parcial por recebimento. Os registros antigos continuam válidos, sem backfill.

**Arquivos e retomada:** a primeira gravação confirma dados, condições, faltantes e termo juntos. Arquivos binários continuam no armazenamento privado já existente e são transferidos separadamente, pois S3/disco não participa da transação Mongo. A entrada fica explicitamente pendente até todos os arquivos esperados estarem vinculados. Cada upload é validado por empresa, chave e hash; retry normal retorna a mídia existente sem persistir novo arquivo. A disputa de dois uploads é protegida pelo índice para não duplicar metadados. Uma corrida/falha de resultado incerto no storage ainda pode produzir objeto órfão; não há limpeza destrutiva automática.

O FE verifica tipo, vazio, tamanho e duplicação de arquivo antes de criar a entrada; o backend continua validando conteúdo no upload. Depois de recarregar a página, o operador precisa selecionar novamente o arquivo original: os binários/assinatura não são guardados no storage do navegador. Somente a chave da operação fica na sessão e na URL, com recuperação tolerante a storage bloqueado. O painel mostra cada arquivo faltante; uma seleção com conteúdo diferente é recusada. Lista/detalhe deixam visível a pendência e oferecem retomada.

**Limites deste incremento:** não há autosave dos campos antes do primeiro envio, edição versionada de rascunho já salvo, substituição do manifesto por outro arquivo nem política automática de expiração/limpeza. O assistente por etapas e essas decisões continuam no próximo lote. A sequência legada de APIs ainda pode ser usada por clientes antigos e não ganhou idempotência retroativa. Não se declara o fluxo inteiro livre de falhas/duplicação para esses clientes.

**Critérios executados:** 8 integrações com serviços reais/Mongo descartável incluem gravação conjunta, replay, conflito de conteúdo, requisições concorrentes, rollback de componente, tenant/operador, upload por chave/hash/concorrência, confirmação repetida e HTTP com validação/guarda real de eventos (autenticação em fixture). Há 7 testes FE de comando único, manifesto/metadata, upload interrompido, retomada sem novo cabeçalho, arquivo incorreto/duplicado/não suportado e consulta após resposta perdida. Dois unitários de upload verificam autorização/replay antes de armazenamento e remoção somente do novo temporário.

## Verificação final e evidências

Logs locais em `evidencias/lote1-final-*`; evidências específicas em `lote1-estoque-*`, `lote1-financeiro-*`, `lote1-pix-*` e `lote1-recebimento-*`. Os logs `.log` são ignorados pela regra geral do Git e estão disponíveis no workspace. Não foi criado commit.

| Check | Resultado observado |
|---|---|
| FE tipos, lint e build | Aprovados |
| FE Vitest | **38 testes / 8 arquivos aprovados** |
| BE tipos, lint e build | Aprovados; lint **0 erros / 19 avisos remanescentes** |
| BE Jest | **255 testes / 32 suítes aprovados** |
| E2E HTTP existentes | **5 testes aprovados**, com mocks; não equivalem à jornada real |
| Integração financeira | **17 aprovados** |
| Integração de referências/tenant | **14 aprovados** |
| Integração estoque/compras | **18 aprovados** |
| Integração Pix/portal | **7 aprovados** |
| Integração recebimento composto | **8 aprovados**, incluindo controller/DTO/guarda de eventos |
| Total de integrações na cadeia | **64 cenários**, Mongo descartável |
| Inspeção visual/teclado/mobile | **Não executada**; continua pendente |

Na retomada, uma execução anterior do `npm` terminou com “Could not determine Node.js install directory”. Os checks foram refeitos com o executável instalado em `C:/Program Files/nodejs`; essa interrupção não foi tratada como falha de código nem como aprovação de testes não concluídos. A alteração final de perfis múltiplos no comando composto teve sua integração focada repetida.

## Compatibilidade, índices e publicação

1. **MongoDB deve suportar transações** (replica set ou cluster compatível), requisito já presente no financeiro e agora usado no estoque/recebimento. Não há fallback que aceite gravação parcial em standalone.
2. Publicar primeiro o backend compatível, depois o frontend. As rotas antigas não foram removidas, mas declarar quitação manual e presumir mesmo ID após PATCH de movimento não são comportamentos suportados pela nova regra.
3. Garantir os índices únicos parciais de operação/mídia antes de ativar o novo frontend. `scripts/recebimento-idempotencia-indexes.cjs` **sem argumentos imprime apenas o plano, sem conexão**. A opção `--apply --uri-env NOME_DA_VARIAVEL` cria somente esses índices, sem remover índice ou alterar registro. O script não foi aplicado a ambiente real. Se houver conflito, investigar os dados em vez de apagá-los.
4. Nenhum destino Pix foi preenchido automaticamente: cada empresa precisa configurar seu beneficiário. A ausência é mostrada de forma explícita no portal.
5. Antes de uso real, fazer homologação visual por papel e teste de uploads/storage do ambiente. Não afirmar que typecheck/SSR provam responsividade ou acesso real por token.

## Próximo lote

O passo seguinte do plano é a ficha interna de atendimento, o assistente por etapas e a unificação da apresentação técnica/financeira/retirada. Permanecem as decisões D5–D11, em especial devolução sem reparo, terceiro, qualidade, revisão/expiração, protocolos e paginação. O lote atual entrega integridade e recuperação delimitadas; não encerra a avaliação nem os demais riscos do fluxo.

A orquestração de reserva/consumo de peças na OS ainda precisa ser consolidada em um comando composto: a proteção do ledger/cache não torna automaticamente atômicas todas as chamadas feitas pela OS. Também permanece distinto o percurso de baixa direta de título no financeiro administrativo; ele não foi transformado silenciosamente em um Pagamento de venda. A ficha deverá tornar explícito o percurso correto e suas pendências.
