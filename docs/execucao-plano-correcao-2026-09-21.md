# Execução do plano de correção

Iniciada em 21/09/2026, horário de Brasília. Referência: [plano](plano-correcao-producao-2026-09-21.md).

## Etapa 0 — Em andamento

A API foi localizada no node4. Criada tarefa temporária no Swarm para obter exclusivamente a cópia de `/app/uploads` da API pelo socket Docker, sem reiniciar a aplicação. Tarefa e configuração temporárias removidas após concluir a cópia. Acesso direto por SSH ao node4 não estava disponível.

Destino protegido no manager: `/home/lemuel/stacks/05-apps/preservacao-20260922T010515Z` (diretório 0700; arquivos de backup 0600).

| Artefato | Resultado | SHA-256 |
|---|---|---|
| uploads.tar | 5.120 bytes; dois arquivos presentes, inventariados individualmente em uploads-manifest.json | 7f608a6101f9b3be6be811cd6885deb0cdda5eafcdca909f3ddf5068cc6b683d |
| mongo.archive.gz | 187.828 bytes; mongodump com gzip e oplog concluído | 9c9598d4d42dca603226a24bf41d06ce96f07783d172f8c861a02f997697b104 |

Limites: esta cópia é local ao conjunto de servidores, não backup externo. Banco e arquivos foram copiados em momentos distintos sem bloquear gravações; não se declarou um snapshot consistente conjunto. Ainda falta conciliar arquivos referenciados no banco com o manifesto, identificar ausentes e executar a sincronização final na migração. A tentativa de inventário pelo cliente de banco no contêiner de backup não concluiu; o dump propriamente dito concluiu. Não há evidência de perda nova causada pela execução.

## Etapa 1 — Correção local parcial de F05/F06

- Criada camada de armazenamento de uploads com driver local e driver S3 compatível com MinIO, usando configuração privada por Docker secret (`UPLOAD_STORAGE=s3` e `UPLOAD_S3_CONFIG_FILE`) quando ativada.
- Controllers de foto de produto, mídia de recebimento e anexo financeiro passam a validar conteúdo antes de gravar metadados e a persistir pelo adaptador. CSV válido é aceito; texto disfarçado de PNG é rejeitado.
- Downloads privados e pacote probatório financeiro passam a ler os bytes pelo adaptador, sem depender de `/app/uploads` existir no mesmo nó da API.
- Hashes e URLs atuais foram preservados, mantendo compatibilidade com `/uploads/<area>/<arquivo>` e autorização por empresa antes da leitura.

Validação local deste incremento: `npm run typecheck`, `npm run build` e verificação runtime da validação de upload aprovados.

Tentativa operacional no Swarm: provisionamento do bucket `mantec3-uploads` e do usuário dedicado `mantec3-uploads-api` foi tentado com tarefa temporária no manager, usando secrets existentes do MinIO e sem imprimir credenciais. As tarefas temporárias e secrets temporários foram removidos. Nenhum secret final `m3-upload-s3-config-v1` foi criado e a stack permanente não foi alterada, porque o MinIO retornou `Access Denied` ao criar bucket com as credenciais disponíveis. Pendente: criar/validar bucket e credencial dedicada pelo caminho administrativo correto do MinIO, depois ativar a stack.

Ainda falta: migrar os arquivos preservados para o bucket, conferir hashes, ativar a stack, recriar a API em homologação e provar que anexos sobrevivem a redeploy/mudança de nó. A etapa 1 não está concluída.

## Etapa 2 — Correções locais de F01

- Vendas e recebimentos validam a empresa do cliente antes de criar e antes de trocar a referência em edição.
- Listas/detalhes desses registros não preenchem dados de cliente externo, inclusive em registros inconsistentes anteriores.
- Venda não pode ser movida para outra empresa por edição.
- PDFs filtram cliente pela empresa do documento. Referências de OS, recebimento, orçamento, produtos e serviços no atendimento também receberam filtro de empresa.
- Teste de integração com Mongo descartável cobre criação cruzada, alteração cruzada sem modificar o registro, cliente próprio, registros antigos e identificadores inexistentes/inválidos. Auditoria e sincronização financeira são substituídas apenas nesse teste de referência; a persistência e consultas dos registros usam Mongo real.
- O comando `npm run test:integration` passa a incluir os novos testes de referência; execução específica disponível em `npm run test:tenant-references`.
- Itens de venda agora validam que produto/serviço pertencem à empresa da venda antes de criar ou editar. Também foi fechado o caso em que um item antigo de outra empresa poderia ser atualizado apontando para uma venda própria.
- A população de produto/serviço nos itens da venda também filtra pela empresa da venda, evitando expor detalhes de referência externa em registros inconsistentes anteriores.

Validação deste incremento: 135 testes unitários, cinco e2e e quatro novos testes de integração aprovados no primeiro lote; depois, `npm run typecheck` e `npm run test:tenant-references` aprovados com seis cenários de integração. Build aprovado após a correção de uploads. Lint sem erros no lote anterior, com 18 avisos. Não se declarou nova execução dos testes de transação anteriores neste incremento.

Ainda falta: revisar todas as referências dos demais módulos, permissões de escrita, relatórios/portal e dados antigos; comprovar a correção pela API publicada. F01 não está integralmente encerrada.

## Etapa 3 — Correção local de F02

- Baixa manual de título financeiro passa a aceitar `Idempotency-Key` no cabeçalho da requisição.
- O movimento de caixa grava chave e hash do conteúdo da operação. Reenvio com a mesma chave e mesmo conteúdo retorna o movimento existente sem criar nova baixa, sem alterar saldo novamente e sem gravar outro movimento.
- Reutilização da chave com conteúdo diferente é rejeitada.
- Corrida por duas requisições simultâneas passa a depender de índice único por empresa/chave no schema de movimentos; se houver duplicidade, o serviço tenta retornar o movimento já gravado em vez de propagar erro bruto.
- Saldo da conta financeira passou de leitura + gravação para incremento atômico (`$inc`), reduzindo risco de perda de atualização concorrente em movimentos confirmados.

Validação local: `npm test -- financeiro-adm.service.spec.ts --runInBand` aprovado com 19 cenários, incluindo reenvio idempotente de baixa.

Ainda falta: publicar em homologação, criar/aplicar o índice no banco real, repetir o teste F02 via API com `Idempotency-Key` e validar pagamento de venda em concorrência real.

## Etapa 4 — Correção local parcial de F03/F04

- Criada coleção materializada `saldosEstoque` por empresa/produto, com índice único.
- Criação de movimento de estoque agora aplica o saldo por `findOneAndUpdate` condicional e atômico antes de gravar o movimento. Saídas, perdas e consumos exigem saldo físico/disponível suficiente; reservas exigem disponível suficiente; estorno de reserva exige reservado suficiente.
- Quando não existe saldo materializado, o serviço inicializa o saldo a partir dos movimentos existentes daquele produto/empresa antes de aplicar a próxima operação.
- Se a gravação do movimento falhar após reservar/baixar saldo, o serviço tenta reverter o delta aplicado.
- Consumo/remoção de reserva de OS agora usa `findOneAndDelete` para tomar posse da reserva; uma segunda chamada concorrente não deve consumir a mesma reserva novamente.

Validação local: `npm test -- estoque.service.spec.ts --runInBand` aprovado com quatro cenários; execução conjunta `npm test -- financeiro-adm.service.spec.ts estoque.service.spec.ts --runInBand` aprovada com 23 testes.

Complemento de validação: adicionado `test/estoque-concorrencia.integration.ts`, com Mongo descartável, comprovando que oito saídas simultâneas contra uma unidade disponível aceitam somente uma gravação e mantêm `saldoFisico`, `disponivel` e `reservado` coerentes. O script `npm run test:integration` passa a executar esse cenário.

Ainda falta: repetir a disputa da mesma reserva com teste integrado específico; revisar atualização/remoção manual de movimentos antigos; criar roteiro de backfill/checagem da coleção `saldosEstoque` antes do deploy.

## Etapa 5 — Correção local parcial de F07/F08

- Adicionado filtro global `MongooseExceptionFilter` para converter erros de `ObjectId` inválido vindos do Mongoose/BSON em HTTP 400 com mensagem controlada.
- Isso cobre rotas que ainda usam `findById`, `_id` direto ou populações antigas e antes poderiam vazar erro interno/500 ao receber identificador malformado.
- Mantém erros não relacionados propagando normalmente para o tratamento padrão.

Validação local: `npm test -- mongoose-exception.filter.spec.ts --runInBand` aprovado com dois cenários.

Ainda falta: repetir a matriz F07/F08 via API publicada, revisar rotas que retornam `null`/sucesso vazio para recurso único fora da empresa, e decidir onde retornar 404 explícito em vez de corpo vazio.

## Próximas ações, em ordem

1. Criar/validar credencial administrativa ou usuário dedicado no MinIO para o bucket `mantec3-uploads`, sem usar credencial ampla da aplicação.
2. Ativar `UPLOAD_STORAGE=s3` na stack após criar o secret `m3-upload-s3-config-v1`, migrar arquivos e validar hashes antes de recriar a API.
3. Criar teste integrado para disputa simultânea da mesma reserva e definir backfill do saldo materializado.
4. Completar matriz de referências e testes de F01, inclusive alterações de vínculos em outros módulos.
5. Repetir F07/F08 via API e corrigir retornos nulos/sucesso vazio por rota.
6. Prosseguir com dependências, recuperação completa e demais etapas do plano.

As alterações de código deste incremento permanecem locais. Não houve commit, envio ao repositório ou deploy; a versão em homologação ainda contém as falhas do relatório anterior.
