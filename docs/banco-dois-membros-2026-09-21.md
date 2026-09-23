# Replica set com dois membros — 21/09/2026

Por decisão do responsável, os notebooks antigos não serão atualizados neste momento. Foi implantada a topologia com dois membros de dados MongoDB 7.0.43:

| Nó | Serviço | Endereço do membro | Volume local | Estado observado |
|---|---|---|---|---|
| node2 | mantec3_mongo | tasks.mantec3_mongo:27017 | mantec3_mongo_data | PRIMARY |
| node4 | mantec3_mongo-secondary | tasks.mantec3_mongo-secondary:27017 | mantec3_mongo_secondary_data | SECONDARY |

Cada serviço tem uma única tarefa, fixada no nó correspondente. Ambos são votantes e elegíveis, com prioridade 1; o conjunto permanece `mantec3-rs`. Não se aumentou o número de tarefas de um serviço compartilhando volume.

## Limitação aceita

**Dois membros oferecem duas cópias dos dados, mas não tolerância automática à perda de qualquer servidor para continuar gravando.** A maioria de dois votos é dois. Se um membro ficar indisponível, o conjunto perde a capacidade de confirmar gravações por maioria e de eleger um novo primário com o membro restante sozinho. O primário também pode perder sua função ao constatar a falta de maioria.

O write concern padrão continua `majority`. Não foi reduzido para `w:1`, não foi usado `force` na reconfiguração e não foi criado árbitro nos notebooks incompatíveis. Recuperação com perda prolongada de um membro exige procedimento supervisionado, avaliação da cópia mais recente e prevenção de dois servidores atendendo como primário de conjuntos divergentes. Não executar reconfiguração forçada automaticamente.

Essa limitação decorre das [regras de maioria e arquitetura de replica sets do MongoDB](https://www.mongodb.com/docs/manual/core/replica-set-architectures/). Backup externo e redundância de três membros continuam sendo melhorias futuras, não entregas desta etapa.

## Implantação e verificações

- `node4` apresentava aproximadamente 6,4 GiB de memória disponível e 350 GiB livres no filesystem do Docker.
- Novo volume independente; autenticação e keyfile iguais aos do conjunto, sem exposição de porta pública.
- Membro inicialmente adicionado sem voto e prioridade zero. A sincronização terminou com sucesso antes da habilitação do voto.
- Durante a entrada inicial, o healthcheck do novo serviço precisou aceitar `ping` para o Swarm publicar seu endereço antes da cópia dos usuários. Após a sincronização, foi restaurado o healthcheck autenticado, com verificação de estado PRIMARY ou SECONDARY. O serviço reiniciou e voltou como secundário antes da promoção a votante.
- Contagens e índices iguais nos dois membros: **44 coleções, 3.496 documentos e 89 índices**.
- Dois registros confirmados em transação com `w:majority` apareceram no secundário; dois registros de outra transação desfeita não apareceram. A coleção fictícia foi removida.
- Resultado observado: dois membros votantes, `majorityVoteCount: 2`, `writeMajorityCount: 2`, um PRIMARY e um SECONDARY saudáveis.
- API respondeu HTTP 200 com banco conectado em 21/09/2026 às 20:32:35 UTC.
- Backup com a conexão atualizada terminou com `BACKUP_OK` em 21/09/2026 às 20:30:52 UTC.
- Monitor registrou dois membros de dados saudáveis. Regras aprovadas pelo `promtool`; alerta de menos de três membros substituído por alerta crítico de menos de dois membros saudáveis.

Não foi provocado desligamento de um membro após a promoção: a indisponibilidade resultante é uma limitação conhecida desta topologia. Esta verificação não substitui os testes de carga e dos demais fluxos comerciais pendentes.

Evidência sem credenciais: [resultado da comparação e transação](evidencias-replica2-2026-09-21.json).

## Persistência e manutenção

- Stack permanente: `/home/lemuel/stacks/05-apps/mantec3.yml`.
- Cópia anterior, candidatas e evidências: `/home/lemuel/stacks/05-apps/replica2-mantec3-20260921/`, acesso restrito.
- Aplicação, monitor e backup passaram a conhecer ambos os endereços iniciais. Secrets atualizados: `m3-app-uri-v2`, `m3-monitor-uri-v2`, `m3-backup-config-v3`; administração: `m3-admin-uri-v2`.
- `m3-keyfile-v1` continua compartilhado entre os membros. `m3-monitor-uri-v1` continua necessário nos healthchecks locais dos dois bancos; não o remover.
- A imagem da API encontrada em execução era `78a6d97c34e91fdf820196aff30509eb227727f3` e foi preservada durante esta mudança de infraestrutura.
- Backups continuam a cada seis horas, com retenção de 14 dias, no manager. A segunda cópia do banco não substitui backup externo.

Os registros de hardening anteriores descrevem a etapa com um membro; este documento atualiza a topologia efetivamente implantada.
