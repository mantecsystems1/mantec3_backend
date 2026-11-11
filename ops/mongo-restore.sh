#!/bin/sh
# Restaura um arquivo gerado por ops/mongo-backup.sh.
#
# Uso:
#   RESTORE_URI="mongodb://usuario:senha@host:27017/?authSource=admin" \
#   RESTORE_CONFIRM=sim \
#   [RESTORE_FROM_DB=mantec RESTORE_TO_DB=mantec_restaurado] \
#   [RESTORE_DROP=sim] \
#   sh ops/mongo-restore.sh /backup/mantec-AAAAMMDDTHHMMSSZ.archive.gz
#
# Segurança:
# - exige RESTORE_CONFIRM=sim (evita restauração acidental);
# - confere o .sha256 gerado junto com o backup, quando existir;
# - por padrão NÃO apaga coleções existentes; RESTORE_DROP=sim substitui as coleções restauradas;
# - recomendado: restaurar primeiro em um banco/servidor separado (RESTORE_TO_DB) e conferir
#   com ops/mongo-compare-counts.cjs antes de qualquer troca em produção.
set -eu
umask 077

archive="${1:-}"
[ -n "$archive" ] && [ -f "$archive" ] || { echo "Informe o arquivo de backup (.archive.gz)." >&2; exit 2; }
[ -n "${RESTORE_URI:-}" ] || { echo "Defina RESTORE_URI com o servidor de destino." >&2; exit 2; }
[ "${RESTORE_CONFIRM:-}" = "sim" ] || { echo "Defina RESTORE_CONFIRM=sim para confirmar a restauração." >&2; exit 2; }

if [ -f "$archive.sha256" ]; then
  expected=$(cut -d' ' -f1 "$archive.sha256")
  actual=$(sha256sum "$archive" | cut -d' ' -f1)
  [ "$expected" = "$actual" ] || { echo "Hash do backup não confere; arquivo corrompido ou alterado." >&2; exit 3; }
  echo "Hash conferido."
else
  echo "Aviso: arquivo .sha256 não encontrado; integridade não verificada." >&2
fi

set -- --uri="$RESTORE_URI" --archive="$archive" --gzip
if [ -n "${RESTORE_FROM_DB:-}" ] && [ -n "${RESTORE_TO_DB:-}" ]; then
  set -- "$@" --nsFrom="${RESTORE_FROM_DB}.*" --nsTo="${RESTORE_TO_DB}.*"
fi
[ "${RESTORE_DROP:-}" = "sim" ] && set -- "$@" --drop

started=$(date +%s)
mongorestore "$@"
echo "RESTORE_OK em $(( $(date +%s) - started ))s"
