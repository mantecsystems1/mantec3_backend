# Verificação de transações na homologação

> Atualização posterior: autenticação, MongoDB 7, backups e monitoração foram implantados. Consulte o [estado atual e as pendências](banco-hardening-homologacao-2026-09-21.md). O diagnóstico de banco standalone abaixo é histórico.

## Atualização: conversão concluída em 21/09/2026

O diagnóstico abaixo descreve o estado anterior. Após autorização do usuário, o MongoDB foi convertido para o replica set de um membro `mantec3-rs`, mantendo uma réplica no Swarm, o volume existente e o nó `node2`.

- Stack permanente atualizada: `/home/lemuel/stacks/05-apps/mantec3.yml`.
- Cópia anterior, especificações dos serviços e evidências: `/home/lemuel/stacks/05-apps/preparacao-replicaset-20260921T100547Z/` no servidor SSH.
- Backup: `backup/mantec-before.archive.gz`, com 119.643 bytes e SHA-256 `394c6f20fefaa9d0d6b1ba770bb0daa0ac7135777a36710c87375fa14551612f`.
- Aplicação pausada para backup consistente; restauração testada em banco temporário separado. A primeira tentativa de iniciar o banco temporário no manager falhou com código 132; o teste foi movido para node2, onde MongoDB 6 já funcionava. Não houve restauração sobre o banco original.
- 3.496 documentos restaurados, zero falhas. As 44 coleções e as contagens de documentos e de índices (89 no total) coincidem entre origem, restauração e banco após conversão.
- Teste real de transação: dois registros confirmados; outros dois desfeitos. Coleção fictícia removida ao final. Um erro de limpeza na API do shell foi corrigido e o teste completo repetido com sucesso.
- Todos os serviços temporários de diagnóstico, backup e restauração foram removidos; o arquivo de backup foi preservado, com acesso restrito ao proprietário.
- API reativada sem publicar uma nova versão do software. Imagem preservada: `mantecsystems/mantec3-back:da6da5410721a366cbbadf0f66ca35a27ac36261`.
- Verificação pública em `https://mantec3.portalmantec.com.br/health/ready`: HTTP 200, `status: ok`, `database: connected`, às 10:11:42 UTC.

O replica set de um membro habilita transações, mas não oferece alta disponibilidade. As correções locais do software ainda precisam ser publicadas e testadas na homologação; essa alteração não as publicou.

Consulta realizada em 21/09/2026 pelo acesso SSH autorizado.

## Resultado

O MongoDB da homologação está em modo standalone, sem replica set. Essa configuração não suporta as transações de múltiplos documentos exigidas pela correção dos pagamentos.

## Evidência

- Serviço da API: `mantec3_mantec3`, domínio confirmado pelas configurações de roteamento `mantec3.portalmantec.com.br`.
- Serviço do banco: `mantec3_mongo`, imagem `mongo:6`, nó `node2`.
- O serviço não define argumentos de inicialização nem arquivo de configuração montado pelo Docker Config; há um volume persistente em `/data/db`.
- Consulta direta `hello` ao banco pela rede interna: `ok: 1`, `isWritablePrimary: true`, `maxWireVersion: 17`, sem `setName`/membros de replica set e sem indicação de roteador mongos. `isWritablePrimary` sozinho não comprova replica set.
- Tarefa de diagnóstico temporária executada na rede interna e removida após a consulta. Nenhuma gravação no banco, reinício ou alteração do serviço da aplicação/banco.

## Próxima etapa

Preparar backup verificado, fixar a localização do volume persistente no nó correto e planejar a conversão para replica set. Um membro permite transações, mas não oferece alta disponibilidade. A conversão exige alteração da inicialização do MongoDB, inicialização do conjunto e ajuste da conexão da API; pode causar indisponibilidade breve e deve ser planejada antes da execução.

Depois da conversão, testar confirmação e rollback com registros fictícios isolados, limpar somente esses registros e repetir o teste financeiro concorrente na aplicação corrigida. Não publicar a correção transacional de pagamentos antes dessa adequação.
