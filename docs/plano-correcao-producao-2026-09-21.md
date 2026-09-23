# Plano de correção e liberação comercial

Base: [homologação de 21/09/2026](resultados-homologacao-fases-2026-09-21.md).

Estado atual: **execução iniciada; etapas 0, 1, 2, 3, 4 e 5 em andamento**. Preservação inicial realizada, uploads persistentes implementados parcialmente no código, correções de F01 ampliadas/testadas localmente, idempotência financeira implementada localmente, saldo atômico de estoque iniciado e tratamento global de ObjectId inválido implementado. Nenhuma etapa integralmente concluída ou nova versão publicada. Acompanhar [registro de execução](execucao-plano-correcao-2026-09-21.md). O plano cobre F01–F08 e as validações ainda pendentes. Não reabre como defeito aquilo que já passou; prevê regressão quando uma alteração puder afetar esses resultados.

Objetivo: eliminar os bloqueadores de segurança, integridade e perda de arquivos, comprovar recuperação e realizar um piloto antes da venda geral. A infraestrutura permanece com os dois membros MongoDB disponíveis. Um terceiro servidor não é pré-requisito deste plano; a indisponibilidade de escrita na perda de um membro deve constar das condições de operação.

## Ordem e responsabilidades

| Etapa | Entrega | Origem | Dependência | Responsável principal |
|---|---|---|---|---|
| 0 | Preservação e inventário | Preparação | Nenhuma | Desenvolvimento + operação |
| 1 | Arquivos persistentes e uploads válidos | F05, F06 / fases 3–4 | 0 | Operação + desenvolvimento |
| 2 | Isolamento das referências entre empresas | F01 / fase 1 | 0; publicação após 1 | Desenvolvimento |
| 3 | Pagamentos protegidos contra reenvio | F02 / fase 2 | 2 | Desenvolvimento |
| 4 | Estoque e reservas consistentes | F03, F04 / fase 2 | 2 | Desenvolvimento |
| 5 | Respostas de erro e dependências | F07, F08 / fase 1 | 2–4 | Desenvolvimento |
| 6 | Recuperação completa e operação | Fase 4 | 1–5 | Operação |
| 7 | Regressão, documentos e carga ampliada | Fases 1–5 | 1–6 | Desenvolvimento + testes |
| 8 | Integrações da primeira versão | Fase 6 | Escopo definido; 7 para aceite final | Desenvolvimento + responsável pelo produto |
| 9 | Piloto e decisão comercial | Fase 6 | 7–8 | Responsável pelo produto + operadores |

O responsável pelo produto é quem define o que será vendido, as integrações incluídas e os níveis de recuperação prometidos. O trabalho de correção de código pode começar após o inventário, mas **nenhuma recriação da API deve ocorrer antes de preservar e migrar os uploads**. A definição do escopo de integrações pode ocorrer desde a etapa 0.

## Etapa 0 — Preservar o estado e preparar a execução

**Roteiro**

1. Registrar commits, imagens, stacks permanentes, versões, arquivos de configuração e situação dos dois membros, sem copiar segredos para relatórios.
2. Inventariar os anexos existentes e copiar os bytes do contêiner atual para destino protegido; gerar manifesto com caminho, tamanho e hash. Registrar arquivos referenciados no banco mas já ausentes.
3. Gerar backup do banco e vincular os registros à cópia de arquivos. Se houver gravações durante a cópia, fazer sincronização final com janela controlada de bloqueio de gravações.
4. Preparar empresas fictícias A/B, usuários por perfil e scripts reproduzíveis. Corrigir as expectativas equivocadas já documentadas no teste de saldo físico e no HTTP 401 do portal.
5. Abrir checklist F01–F08 com reprodução, comportamento esperado, evidência e versão. Inventariar possíveis inconsistências existentes sem excluir nem corrigir registros automaticamente.

**Concluída quando:** cópias verificadas, inventário disponível e testes reproduzem os defeitos nos ambientes adequados. Saída: evidência inicial e procedimento de retorno à versão anterior.

## Etapa 1 — Preservar anexos e validar seu conteúdo

**Roteiro**

1. Definir armazenamento durável e acessível pela aplicação independentemente do nó em que ela executar. Inspecionar as opções disponíveis antes de escolher entre armazenamento de objetos e filesystem compartilhado; um volume local isolado, sozinho, não resolve mudança de nó.
2. Implantar a configuração na stack permanente e adaptar a aplicação quando necessário. Preservar a autorização por empresa em todos os downloads e evitar exposição pública do armazenamento.
3. Migrar os arquivos inventariados, conferir hashes e manter as referências antigas funcionais ou executar migração rastreável dessas referências.
4. Validar formato pelo conteúdo, além da extensão e tipo informado. Aplicar limites de tamanho e de dimensões quando forem imagens. Rejeitar arquivo inválido sem deixar registro ou arquivo órfão.
5. Definir o ciclo de exclusão e retenção: o que acontece com os bytes ao remover um anexo e como tratar órfãos sem apagar arquivos ainda usados.
6. Fazer cópia externa dos anexos e preparar o processo de restauração para a etapa 6.

**Testes de aceite:** upload válido mantém hash e privacidade; texto disfarçado de PNG é rejeitado; arquivos truncados e acima do limite falham de forma controlada; recriação da API e mudança controlada de nó mantêm acesso aos anexos. Simular primeiro com dados descartáveis.

**Retorno em caso de falha:** conservar a cópia original e restaurar configuração/referências compatíveis; nunca depender do contêiner antigo como única cópia. Remover cópias antigas apenas após recuperação comprovada.

## Etapa 2 — Fechar o isolamento entre empresas

**Roteiro**

1. Mapear as referências de cliente, recebimento, orçamento, OS, produto, técnico, venda, conta e demais entidades utilizadas nas gravações.
2. Obter a empresa da sessão autenticada. Validar cada referência dentro dessa empresa antes de criar ou editar; permissões globais de administração devem ser explícitas.
3. Corrigir primeiro recebimentos e vendas, reproduzidos em F01, e revisar as outras relações pelo mesmo critério.
4. Proteger também leitura, documentos, exportação e portal contra referências cruzadas já existentes. Evitar retornar campos de outra empresa ao preencher relações.
5. Gerar relatório de registros inconsistentes existentes. Separar massa de teste de dados legítimos e preparar correção rastreável caso a caso; não deduzir nem substituir automaticamente o cliente correto.

**Testes de aceite:** usuários A não conseguem criar/editar registros referenciando B; respostas e documentos não expõem nome/documento de B; operações válidas de A continuam funcionando. Cobrir permissões de escrita, além das consultas já testadas.

**Concluída quando:** nenhuma referência cruzada da matriz é aceita ou exposta, e registros antigos identificados têm tratamento documentado. Uma regressão de isolamento bloqueia a liberação.

## Etapa 3 — Impedir pagamentos duplicados por reenvio

**Roteiro**

1. Definir o contrato de idempotência: uma chave representa uma intenção de pagamento e fica vinculada à empresa, operação e conteúdo normalizado.
2. Persistir a chave e aplicar unicidade no banco, incluindo proteção contra pedidos simultâneos. Integrar pagamento, caixa, título e registro de idempotência à mesma transação.
3. Retornar o resultado já confirmado para repetição da mesma chave/conteúdo; rejeitar reutilização da chave com conteúdo diferente. Definir resposta para operação ainda em processamento e política de retenção.
4. No frontend, gerar a chave ao iniciar a intenção e reutilizá-la após timeout/reenvio. Desabilitar duplo clique como melhoria de uso, mantendo a proteção no servidor.
5. Conferir possíveis duplicidades antigas por relatório; não estornar automaticamente pagamentos parecidos que possam ser legítimos.

**Testes de aceite:** pedidos paralelos iguais, timeout após confirmação e repetição após reinício produzem um único pagamento e um único efeito financeiro. Chave igual com conteúdo diferente é rejeitada. Pagamentos legítimos distintos continuam permitidos e a proteção contra ultrapassar o saldo permanece ativa.

**Publicação:** instalar índices e backend compatível antes de ativar o fluxo no frontend. Uma reversão não deve apagar o histórico das chaves confirmadas.

## Etapa 4 — Tornar estoque e reservas seguros sob concorrência

**Roteiro**

1. Definir as invariantes: físico e reservado não negativos; reservado não superior ao físico; disponível coerente com ambos; um consumo por reserva.
2. Escolher o mecanismo de concorrência sobre um registro compartilhado por empresa/produto, com atualização condicional e transação para os efeitos relacionados. Apenas envolver leitura e inserção de movimentos em uma transação pode não impedir duas decisões concorrentes sobre o mesmo saldo.
3. Se introduzir saldo materializado, recalculá-lo a partir dos movimentos, identificar divergências e criar os índices necessários antes de usá-lo como fonte de decisão.
4. Corrigir saída, reserva, consumo, cancelamento, devolução, ajuste e edição de movimento para usarem a mesma regra. Registrar o movimento e a alteração de saldo de forma indivisível.
5. No consumo, mudar a reserva de pendente para consumida uma única vez, na mesma transação que gera item utilizado e movimentos. Manter identificação para rastreabilidade e reenvio seguro.
6. Auditar inconsistências existentes. Reparar somente registros confirmados, preservando histórico de ajustes e evitando alterações silenciosas no livro de movimentos.

**Testes de aceite:** repetir as cinco rodadas de oito saídas sobre uma unidade, além de disputar a mesma reserva. Somente uma retirada/consumo deve prevalecer; nenhuma quantidade negativa ou item duplicado. Induzir falhas entre as gravações em banco descartável e confirmar rollback completo. Repetir compras, cancelamentos e devoluções afetadas.

**Publicação:** realizar migração em janela controlada, sem versões antigas gravando pelo caminho anterior. Se for necessário voltar, interromper gravações, conferir compatibilidade e reconciliar saldos antes de reabrir.

## Etapa 5 — Padronizar erros e tratar dependências

**Roteiro**

1. Validar identificadores na entrada: formato inválido retorna 400; recurso válido ausente ou fora da empresa retorna 404; falta de permissão para uma função retorna 403. Manter 401 para autenticação inválida.
2. Remover respostas de sucesso vazio nas consultas/alterações de recurso único. Preservar listas vazias legítimas e ajustar o frontend para as novas respostas.
3. Verificar que erros não exibem detalhes internos e podem ser correlacionados nos logs sem registrar segredos.
4. Triar os oito apontamentos moderados do backend e dois do frontend: dependência direta/transitiva, uso real, versão corrigida e impacto. Atualizar com alterações controladas e registrar o risco residual quando não houver correção aplicável.

**Testes de aceite:** os oito grupos de rotas de F07 deixam de gerar 500 para identificadores inválidos; recursos externos não retornam sucesso nem informação de existência; telas exibem mensagens úteis. Auditoria de dependências refeita e regressão das bibliotecas alteradas aprovada.

## Etapa 6 — Comprovar recuperação do serviço completo

**Roteiro**

1. Definir com o responsável o máximo de dados que se aceita perder (RPO) e o tempo máximo de recuperação (RTO). Não prometer metas ainda não medidas.
2. Configurar destino externo ao conjunto atual de servidores, com acesso restrito, retenção e alertas de falha. Preservar também configurações e o procedimento de recuperação de segredos por meio seguro.
3. Produzir conjunto recuperável de banco e arquivos, com manifesto que permita conciliar referências e hashes.
4. Restaurar a partir da cópia externa em ambiente separado. Conferir documentos, índices, anexos, saldos e fluxos de leitura/gravação, usando contas de teste.
5. Medir o tempo total, incluindo obtenção do backup e configuração da aplicação. Simular alerta de backup vencido e confirmar que chega ao responsável operacional por canal acordado.
6. Documentar os passos para perda de um membro e para perda dos servidores. Ensaiar falhas em ambiente descartável; não forçar reconfiguração automática para contornar a maioria dos dois membros.

**Concluída quando:** um operador consegue executar o roteiro e recuperar banco + arquivos a partir da cópia externa, dentro das metas acordadas, com evidência. A recuperação isolada de Mongo já aprovada é ponto de partida, não substitui esta prova.

## Etapa 7 — Executar regressão e carga representativa

**Roteiro**

1. Publicar em homologação as versões corrigidas e registrar imagens/migrações. Executar a matriz F01–F08 e a regressão dos fluxos afetados.
2. Percorrer atendimento → orçamento → OS → reserva/consumo → venda → pagamento/estorno → entrega, além de compras, garantia, recorrência e fechamento mensal.
3. Conciliar valores e estados entre banco, tela, PDF e XLSX. Ajustar a quebra de página que separa o título da tabela no relatório mensal; conferir assinaturas e datas.
4. Ampliar a matriz de interface para formulários principais, teclado, mensagens de erro e larguras de celular/tablet/desktop.
5. Preparar 20 empresas com histórico e anexos representativos. Definir volume a partir do uso esperado; se indisponível, registrar expressamente a hipótese usada.
6. Executar carga mista e sustentada, incluindo gravações, PDFs e uploads. Proposta inicial: 60 minutos com subida gradual e limites de interrupção por falha de integridade, erros ou latência excessiva. Ajustar a duração conforme o volume acordado.
7. Medir latência por tipo de operação, erros, memória, conexões e recuperação após a carga. Comparar com metas estabelecidas antes da execução.

**Concluída quando:** nenhum defeito crítico/alto de segurança ou integridade permanece; dados conciliados; carga acordada atendida. Os 1.000 GETs já aprovados servem de referência, sem substituir esta etapa.

## Etapa 8 — Validar as integrações incluídas na venda

**Roteiro**

1. Definir quais recursos entram na primeira versão: emissão fiscal, WhatsApp, e-mail, consulta IMEI e outros eventualmente contratados.
2. Para cada recurso incluído, identificar provedor, ambiente de teste, configuração, limites e comportamento prometido. Registrar explicitamente o que fica fora do lançamento.
3. Implementar o que estiver apenas registrando dados localmente, caso a promessa comercial exija execução no provedor.
4. Testar sucesso, rejeição, timeout, reenvio, credencial vencida, callback repetido e conciliação do status final, conforme o tipo de integração.
5. Comprovar efeitos no sandbox e impedir que uma simulação seja exibida como execução real.

**Concluída quando:** toda integração incluída possui evidência de ponta a ponta. Recursos adiados ficam indisponíveis ou claramente identificados e fora da oferta. Esta etapa depende de definição de escopo e acessos de teste; não se considera aprovada por falta de configuração.

## Etapa 9 — Piloto e liberação comercial

**Roteiro**

1. Selecionar operadores e uma ou duas empresas piloto; definir os fluxos, responsáveis e canais de suporte.
2. Executar um ciclo operacional completo, incluindo abertura, fechamento, correção de erro e recuperação orientada. Proposta inicial: cinco dias úteis, ampliados se não cobrir o ciclo necessário.
3. Registrar ocorrências, corrigir bloqueadores e repetir os cenários afetados. Recolher aceite dos operadores para tarefas reais, além do resultado automatizado.
4. Finalizar instruções de implantação, suporte, backup, restauração e atualização. Explicitar a limitação de disponibilidade com dois membros e as metas de recuperação comprovadas.
5. Consolidar versões e pendências residuais com responsável e prazo; emitir decisão de liberar ou adiar. Expandir a carteira gradualmente após o piloto.

**Critério de liberação:** F01–F08 tratados, nenhuma pendência crítica/alta aberta, riscos residuais documentados, recuperação comprovada, integrações da oferta aprovadas e aceite do piloto. Dependências moderadas exigem correção ou justificativa de risco aceita, não apenas uma contagem menor no scanner.

## Como acompanhar a execução

Para cada etapa, registrar: `planejada → em execução → em validação → concluída` ou `bloqueada por dependência identificada`. Informar responsável, versão/commit, migração, evidências, pendências e procedimento de retorno.

Uma etapa não está concluída apenas porque o código foi escrito: exige implantação aplicável, teste de aceite e evidência. Ao terminar cada uma, atualizar este documento e o relatório de homologação. Não converter quantidade de testes aprovados em percentual de prontidão para venda.

**Próxima ação do roteiro:** concluir o provisionamento validado do MinIO para uploads persistentes, migrar os arquivos preservados e só então publicar a API corrigida em homologação.
