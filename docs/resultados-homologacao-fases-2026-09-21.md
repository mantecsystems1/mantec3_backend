# Homologação por fases — 21/09/2026

**Decisão: não liberar para venda geral nesta versão.** Os fluxos principais funcionam e a carga de leitura passou, mas há falhas reproduzidas de isolamento entre empresas e consistência de estoque, além de risco de perda de anexos. Uma porcentagem agregada de testes aprovados esconderia esses bloqueadores; não corresponde a uma porcentagem de prontidão comercial.

## Versão e evidências

- Backend publicado: `78a6d97c34e91fdf820196aff30509eb227727f3`.
- Frontend publicado: `5f23b03b26afe3f8505ded7cb635404a6ffb528c`.
- Imagens efetivamente em execução conferidas no Swarm, não apenas nos workflows.
- Execução: `outputs/qa-fases-20260921204303-007d/`. Evidências principais: `results.json`, `stock-isolated.json`, `deployment.json`, `restore.log`, PDFs renderizados e auditorias de dependências.
- Scripts: `ops/qa/`. Esta rodada executou testes; não corrigiu nem publicou as novas falhas descritas abaixo.

## Tarefas e resultado por fase

| Fase | Tarefas executadas | Resultado |
|---|---|---|
| 0 — Preparação | Conferir versões, saúde e criar empresas fictícias isoladas | Aprovada |
| 1 — Segurança | Acesso sem login, nove perfis em dez consultas cada, elevação de privilégio, revogação, isolamento direto e referências entre empresas, entradas inválidas | Reprovada: referências permitem exposição de outro cliente |
| 2 — Operação | Atendimento, orçamento, portal, OS, compras, garantia, reservas, estoque concorrente, pagamentos, estornos, contas a pagar, recorrência, fechamento e reabertura | Reprovada: duplicação e concorrência |
| 3 — Arquivos e documentos | Upload e acesso privado, PDF de orçamento/recibo/termo, assinatura e entrega, relatórios PDF/XLSX | Parcial: conteúdo falso aceito como imagem; persistência ausente |
| 4 — Recuperação | Restaurar backup em Mongo descartável, validar coleções e índices, transações com falha induzida em banco descartável, conferir armazenamento | Banco aprovado no cenário; arquivos e recuperação externa pendentes |
| 5 — Capacidade e interface | Carga gradual em 20 empresas, telas em larguras de celular/tablet, sessão após erro do portal | Aprovada somente para o recorte medido |
| 6 — Integrações e aceite | Inspecionar implementação e identificar dependências para prova real | Pendente: provedores de homologação e piloto humano |

## Falhas confirmadas e prioridade

### F01 — P0: referências cruzadas expõem cliente de outra empresa

Com usuário da empresa A, criar recebimento e venda apontando `clienteId` de B foi aceito com HTTP 201. A resposta da venda retornou o nome do cliente de B; a consulta do recebimento retornou nome e documento de B. Todos os dados usados eram fictícios.

Reprodução registrada em `Cross-tenant receipt client reference rejected`, `Cross-tenant sale client reference rejected` e `Cross-reference cannot expose other client data`. Validar a empresa de cada referência no servidor ao criar/editar, além de restringir consultas. Repetir essa matriz para as demais relações do ERP.

**Distinção da correção anterior H01:** leitura/edição direta de usuário de outra empresa não retornou nem alterou o registro. O HTTP 200 vazio é inadequado, mas não demonstrou retorno daquela falha de isolamento direto. F01 é outro caminho, pelas referências de cliente.

### F02 — P1: repetição do pagamento duplica lançamento

Duas solicitações idênticas com a mesma `Idempotency-Key` resultaram em dois pagamentos de R$ 10, ambos HTTP 201. Os lançamentos fictícios foram estornados. A proteção contra ultrapassar o total da venda passou; ela não substitui a proteção contra reenvio da mesma operação.

### F03 — P1: saída concorrente pode deixar estoque negativo

No teste descartável com serviço e modelos reais, cinco rodadas de oito saídas simultâneas para estoque inicial de uma unidade aceitaram de quatro a oito saídas. Saldos finais: -3, -5, -7, -7 e -7. Evidência: `stock-isolated.json`.

Três rodadas menores na API publicada passaram. Isso não invalida a corrida reproduzida sem mocks de banco, barreiras artificiais ou mudanças no serviço. A verificação de disponibilidade e a gravação precisam ser indivisíveis sob concorrência.

### F04 — P1: mesma reserva consumida duas vezes

Na homologação, dois pedidos simultâneos de consumo retornaram 201/201 e criaram dois itens utilizados para uma reserva. Partindo de duas unidades físicas e uma reservada, o resultado foi `saldoFisico: 0`, `reservado: -1`, `disponivel: 1`. Evidências em `Concurrent reserve consumption debits once` e `Reserve consumption creates one used item`.

### F05 — P1: anexos sem armazenamento persistente

O código salva em `./uploads`, mas o serviço da API possui `Mounts: []`. Os volumes persistentes do Mongo não incluem esses arquivos. Recriação/mudança de nó pode perder anexos; backup só do banco não os recupera. A configuração foi inspecionada; não foi reiniciado o serviço para provocar perda real. É necessário persistir, copiar e restaurar também os arquivos.

### F06 — P2: validação de imagem confia no nome e tipo declarado

Texto simples enviado como `fake.png`/`image/png` foi aceito. Extensão executável e extensão incompatível foram rejeitadas, e downloads anônimos/de outra empresa foram bloqueados. Verificar o conteúdo real do arquivo antes de aceitá-lo.

### F07 — P2: identificadores inválidos geram erro interno

Identificadores malformados retornaram HTTP 500 em oito grupos: clientes, usuários, vendas, orçamentos, OS, recebimentos, produtos e títulos financeiros. Devem ser tratados como erro de entrada/recurso inexistente, sem erro interno.

### F08 — P2: negativa de acesso com HTTP 200 vazio

Consultas e alteração de usuário de outra empresa retornam vazio, sem vazamento confirmado, mas com código de sucesso. Padronizar 403/404. Também foi observado vazio nas consultas diretas de OS e recebimentos externos.

## Resultados positivos e limites

- Os nove perfis adicionais passaram nas 90 verificações de consulta segundo a matriz do sistema. Isso não comprova todas as permissões de escrita nem que a matriz atende ao contrato comercial.
- Tentativas de elevar privilégio, mover usuário para outra empresa e usar sessões revogadas foram bloqueadas. Empresa inativa invalidou o acesso existente. Portal revogado recusou acesso e outra empresa não conseguiu revogá-lo.
- Recebimento → orçamento aprovado pelo portal → execução/conclusão de OS → pagamento → entrega assinada funcionou. Entrega antes de pagamento integral foi bloqueada.
- Compras concorrentes não duplicaram estoque/título no cenário executado; cancelamento reverteu o estoque. Garantia percorreu os estados e registros testados; não houve envio físico nem operação financeira externa.
- Pagamento acima do saldo, baixa excessiva de conta a pagar e lançamento em mês fechado foram rejeitados. Estorno e reabertura passaram.
- Documentos de orçamento e termo foram renderizados e inspecionados. Termo sem assinatura não afirmou aceite. PDF mensal de duas páginas estava legível; há melhoria visual menor: título de seção no fim da primeira página, tabela na segunda. XLSX foi gerado, mas não teve todas as células conciliadas visualmente.
- Na interface, larguras de 390 e 768 pixels não apresentaram rolagem horizontal da página na venda examinada. Portal inválido não derrubou a sessão do ERP. Essa é uma amostra, não uma auditoria completa de acessibilidade/dispositivos.

## Recuperação

Backup novo com oplog restaurado em instância descartável isolada: MongoDB 7.0.43, **44 coleções, 3.636 documentos e 89 índices**, validação íntegra (`RESTORE_OK`). Recursos temporários remotos removidos. Não foi comparada contagem com a origem nessa rodada porque a criação de massa estava em andamento.

Os três testes locais de integração de pagamentos/transações passaram, incluindo rollback após falha induzida. A implantação anterior também comprovou gravação/desfazimento replicados nos dois membros; detalhes em `banco-dois-membros-2026-09-21.md`.

Permanecem sem aprovação: restauração de anexos, cópia externa, desastre envolvendo perda dos servidores e tempo operacional de recuperação. Dois membros são a restrição de infraestrutura aceita pelo responsável; não oferecem continuidade automática de escrita ao perder um deles. Não foi provocado desligamento real nesta rodada.

## Carga medida

Foram preparadas 20 empresas com pelo menos 50 clientes fictícios cada. Consultas autenticadas alternaram clientes, vendas, movimentos de estoque, orçamentos e títulos. Nenhum dado de empresa diferente foi observado nas listas examinadas.

| Simultâneas | Consultas | p95 | Máxima | Erros |
|---|---:|---:|---:|---:|
| 10 | 100 | 795 ms | 1.396 ms | 0 |
| 30 | 300 | 677 ms | 1.078 ms | 0 |
| 60 | 600 | 841 ms | 2.272 ms | 0 |

As 180 consultas da carga inicial com duas empresas também passaram. O teste principal foi curto e de leitura, com histórico pequeno. Não representa 20 empresas trabalhando durante dias, nem carga de PDFs, anexos, importação ou gravações simultâneas. Duas falhas de transporte durante preparação interromperam scripts; a preparação foi retomada e a carga final terminou sem erro. A causa dessas interrupções não foi atribuída ao servidor sem evidência.

## Dependências e integrações

Auditoria de dependências de produção: backend com oito apontamentos moderados; frontend com dois; nenhum alto/crítico no resultado recebido. Contagens são pacotes reportados, não necessariamente falhas independentes ou exploráveis. Arquivos `dependencies-*.json` preservam os detalhes para triagem.

Os serviços inspecionados de nota fiscal, IMEI e notificações registram dados; isso não comprova emissão fiscal, consulta a provedor ou entrega de mensagem. Falta definir quais integrações fazem parte da primeira versão e fornecer ambientes de teste dos provedores. Nenhuma mensagem, cobrança ou emissão real foi realizada.

## Integridade da avaliação

A execução terminou às 22:38:17 UTC (19:38:17 de Brasília). A limpeza retornou HTTP 200 para os 30 usuários de teste e as 20 desativações de empresa. A sessão de portal foi revogada e os registros de mídia de teste removidos. Histórico de operações fictícias foi preservado nas empresas desativadas; não houve exclusão física em massa. A remoção de registros de mídia não comprova limpeza dos bytes no disco.

O registro bruto contém 199 verificações PASS e 21 FAIL, além de observações/tentativas interrompidas. Esses números incluem verificações repetidas e expectativas posteriormente esclarecidas; não são contagem de funcionalidades, defeitos independentes ou percentual de prontidão. O marcador inicial pendente de carga com 20 empresas foi atendido pela rodada posterior `phase5-full`, dentro do volume pequeno explicitado acima.

O relatório bruto preserva tentativas interrompidas e verificações corrigidas. Não contar como defeitos do ERP: massa inicial sem CPF/CNPJ obrigatório; as duas interrupções de transporte sem causa determinada; expectativa que confundia `saldo` com `saldoFisico`; negativa HTTP 401 do portal inicialmente fora da lista de códigos esperados. Os testes complementares esclarecem esses resultados. Tampouco somar falhas duplicadas de H01 como vazamentos distintos.

Não existe aprovação integral de todos os testes possíveis. Após corrigir F01–F05, repetir seus cenários e a regressão correspondente; completar a triagem F06–F08/dependências; recuperar arquivos de backup externo; testar integrações contratadas; executar piloto com operadores, histórico representativo e aceite documentado.
