# Restauração de backup (runbook)

Complementa `ops/mongo-backup.sh` (backup a cada 6 h, `mongodump --archive --gzip --oplog`, hash `.sha256`, retenção de 14 dias).

## Quando usar

- Perda ou corrupção de dados no banco de produção.
- **Ensaio periódico** (recomendado: mensal) para provar que os backups restauram.
- Criar um ambiente de homologação a partir de uma cópia (anonimizar dados pessoais antes de compartilhar).

## Procedimento

1. **Escolha o arquivo** em `/backup` (ex.: `mantec-20261111T113906Z.archive.gz`) e confirme que o `.sha256` correspondente existe.
2. **Restaure primeiro em um banco separado** — nunca direto sobre produção:

   ```bash
   RESTORE_URI="mongodb://usuario:senha@host:27017/?authSource=admin" \
   RESTORE_CONFIRM=sim \
   RESTORE_FROM_DB=mantec RESTORE_TO_DB=mantec_restaurado \
   sh ops/mongo-restore.sh /backup/mantec-AAAAMMDDTHHMMSSZ.archive.gz
   ```

   O script confere o hash, exige `RESTORE_CONFIRM=sim` e não apaga coleções existentes (só com `RESTORE_DROP=sim`).
3. **Confira as contagens** entre o banco restaurado e a origem (ou o relatório do último backup):

   ```bash
   node ops/mongo-compare-counts.cjs "<uri origem>" mantec "<uri destino>" mantec_restaurado
   ```

4. **Teste funcional:** aponte uma API de homologação para o banco restaurado (`MONGO_URI`) e confira login, abertura de um recebimento com fotos, uma venda com pagamento e o fechamento do mês.
5. **Troca em produção** (somente em incidente, com janela comunicada): pare a API, restaure com `RESTORE_DROP=sim` no banco de produção, rode o passo 3 e suba a API. Registre horário, arquivo usado e responsável.

## Evidência de ensaio

| Data | Ambiente | Resultado |
|---|---|---|
| 11/11/2026 | Local, MongoDB descartável (dados fictícios) | Backup com `mongodump` → restauração em banco separado: 112 documentos em 4 s; **51/51 coleções com contagens idênticas** (`mongo-compare-counts.cjs`). Restauração sem `RESTORE_CONFIRM` recusada (saída 2); arquivo alterado recusado pelo hash (saída 3) |
| — | Produção/homologação | **Pendente**: executar o ensaio com um backup real e registrar aqui |

## Pendências de infraestrutura (fora deste repositório)

- **Cópia fora do servidor**: hoje os arquivos ficam no mesmo host do banco (`/backup`). Enviar cada backup para outro local (armazenamento de objetos com versionamento, outra região) e testar a recuperação dele.
- **Uploads**: fotos, vídeos, termos e anexos (`UPLOAD_STORAGE=local` → pasta `uploads`) **não** estão no `mongodump`. Fazer backup da pasta (ou usar `UPLOAD_STORAGE=s3` com versionamento) na mesma frequência do banco.
- **Alerta**: monitorar `/backup/last-success` (já usado por `ops/mongo-monitor.cjs`) e avisar se passar de 7 h sem backup.
