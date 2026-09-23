# Banco da homologação — alterações e validação

> Atualização posterior: foram implantados e verificados **dois membros de dados**, conforme decisão de manter os notebooks atuais. Consulte a [topologia atual, evidências e limitações de maioria](banco-dois-membros-2026-09-21.md). As referências a um membro abaixo descrevem a etapa anterior.

Implementação em 21/09/2026, no ambiente acessado por `lemuel@ssh.portalmantec.com.br`. Este documento complementa e atualiza o relatório inicial de conversão para replica set.

## Estado entregue

- MongoDB **7.0.43**, com compatibilidade de recursos **FCV 7.0**, replica set `mantec3-rs`, um membro em `node2`. Volume original preservado.
- Autenticação obrigatória e autenticação interna por keyfile. Usuários separados para aplicação (`readWrite` somente em `mantec`), administração, backup e monitoração (`clusterMonitor`).
- Credenciais fornecidas aos serviços por Docker Secrets. A URI do banco foi retirada do ambiente gravado na stack da aplicação. Isso não significa que todos os outros segredos preexistentes da aplicação tenham sido migrados.
- MongoDB sem porta publicada. Limite inicial de 1,5 CPU e 1.536 MiB; reserva de 0,25 CPU e 512 MiB; cache WiredTiger de 0,5 GiB. Esses valores ainda precisam de teste de carga representativo das 20 empresas previstas.
- Healthcheck autenticado, rotação dos logs e atualização `stop-first`, evitando dois processos concorrentes sobre o mesmo volume.
- Backup completo com oplog a cada seis horas, checksum SHA-256 e retenção de 14 dias. Destino: `/home/lemuel/backups/mantec3`, no manager `mantec`, separado do nó do banco. Arquivos com acesso restrito. Não é uma cópia externa ao ambiente.
- Monitor interno com métricas de disponibilidade, primário, membros saudáveis, conexões, memória, última execução do backup e espaço no destino.
- Seis regras carregadas no Prometheus: banco indisponível, ausência de primário, falta de redundância, backup atrasado, pouco espaço no destino e monitor sem atualização. Nenhum canal externo de notificações foi configurado nesta etapa.

Stack permanente: `/home/lemuel/stacks/05-apps/mantec3.yml`. Os próximos deploys que usam esse arquivo conservam as alterações. Configurações auxiliares e evidências estão em `/home/lemuel/stacks/05-apps/hardening-mantec3-20260921/`.

Os Docker Configs ativos dos scripts são `m3-backup-script-v3` e `m3-monitor-script-v2`. Os Secrets necessários devem ser preservados: `m3-keyfile-v1`, `m3-app-uri-v1`, `m3-backup-config-v2`, `m3-monitor-uri-v1` e o administrativo `m3-admin-uri-v1`. Existe um arquivo de recuperação de credenciais com permissão 0600 na pasta restrita de evidências; não deve ser copiado para Git, tickets ou mensagens.

## Testes e resultados

| Verificação | Resultado |
|---|---|
| Acesso ao banco sem autenticação | Bloqueado |
| Leitura autorizada pelo usuário da aplicação | Aprovada |
| Operação administrativa pelo usuário da aplicação | Bloqueada |
| Transação confirmada com dois registros | Aprovada |
| Transação desfeita com dois registros | Aprovada; registros ausentes após abort |
| Limpeza dos registros e serviços temporários | Concluída |
| Restauração antes da atualização em MongoDB 7 isolado | Aprovada |
| Restauração de backup posterior à atualização | Aprovada: 44 coleções, 3.496 documentos e 89 índices iguais à origem |
| Validação das coleções restauradas | Aprovada |
| Recuperação após recriação do contêiner | Aprovada; banco permaneceu estável por quase cinco horas antes da finalização da FCV |
| API pública `/health/ready` | HTTP 200, banco conectado |
| Configuração e regras do Prometheus | Aprovadas por `promtool`; métricas recebidas e regras avaliadas |

Backup restaurado após a atualização: `mantec-20260921T200531Z.archive.gz`, 122.468 bytes, SHA-256 `9bcc856564d411197e63e5b0fbe37cc63b6f4ee15744f7fddd156d74ae0b9229`. Evidências sem credenciais: [JSON da verificação](evidencias-banco-2026-09-21.json).

Foi corrigida uma falha reproduzida no reinício: o MongoDB tentava identificar seu membro antes de o DNS do Swarm registrar a tarefa. A configuração final combina `endpoint_mode: dnsrr`, endereço do membro `tasks.mantec3_mongo:27017` e hostname local `tasks.mantec3_mongo`. A atualização e um reinício posterior comprovaram a recuperação. Esse serviço deve continuar com uma única tarefa; não se deve aumentar seu `replicas` para criar membros do banco.

Uma credencial de backup usada durante o diagnóstico apareceu em uma mensagem de erro da ferramenta. Ela foi substituída, os Secrets antigos foram removidos, e o script passou a emitir apenas erros genéricos nos logs do serviço.

## Pendências para produção

1. **Três membros de dados em servidores compatíveis.** `node2` executa o MongoDB 7; `node4` passou no teste do executável, mas ainda precisa da preparação e validação como membro. `node1` e `node3` falharam com código 132 ao executar MongoDB 7. O manager também havia falhado ao executar MongoDB 6. É necessário corrigir a disponibilidade de instruções de CPU nas VMs ou disponibilizar outro servidor compatível. Não foram criadas três réplicas no mesmo servidor. Cada membro futuro precisa de serviço, endereço, volume e localização próprios.
2. **Backup externo ao ambiente.** Falta informar um destino externo e disponibilizar a configuração de acesso por meio seguro. Os backups atuais não cobrem perda conjunta dos servidores ou do local onde estão hospedados. Criptografia e retenção da cópia externa devem fazer parte dessa etapa.
3. **Entrega de alertas ao responsável.** As regras estão funcionando no Prometheus; falta escolher e configurar o canal de notificação. O alerta de falta de redundância está ativo e corresponde à topologia real.
4. **Validação comercial da aplicação corrigida.** As correções locais de backend e frontend ainda precisam ser publicadas e testadas na homologação. Esta mudança de infraestrutura manteve o backend na imagem `da6da5410721a366cbbadf0f66ca35a27ac36261`. Permanecem necessários testes de isolamento entre empresas, carga representativa e recuperação/failover quando houver redundância.

TLS nativo entre cliente e MongoDB e criptografia de disco não foram implantados por esta alteração. A comunicação permanece na rede interna do Swarm; isso não equivale a comprovar criptografia do tráfego do banco.

## Operação e recuperação

Os scripts sem credenciais estão em [backup](../ops/mongo-backup.sh) e [monitor](../ops/mongo-monitor.cjs). O monitor usa as dependências da imagem identificada acima, com script separado, filesystem somente leitura, capacidades removidas e acesso somente ao arquivo de horário do último backup.

A configuração do Prometheus permanece em `/home/lemuel/stacks/04-automation/prometheus.yml`; as regras foram adicionadas ao arquivo já montado `prometheus-rules/mantec-compute-alerts.yml`, preservando os grupos existentes. Cópias anteriores foram guardadas na pasta restrita de evidências.

O workflow local foi ajustado para selecionar apenas `mantec3_mantec3` ao atualizar a imagem da API. Antes ele selecionava todos os serviços que usavam o mesmo repositório de imagem, o que incluiria o novo monitor. Esse ajuste ainda depende da publicação do código.

Para recuperar dados, primeiro verificar o checksum e restaurar em instância isolada compatível; comparar coleções, documentos e índices antes de qualquer substituição do banco em uso. Não aplicar uma stack antiga sem revisar autenticação e volumes, nem trocar diretamente a imagem para MongoDB 6: a FCV foi finalizada em 7.0. O procedimento oficial de atualização e suas restrições estão na [documentação do MongoDB](https://www.mongodb.com/docs/manual/release-notes/7.0-upgrade-replica-set/).
