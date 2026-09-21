#!/bin/sh
set -eu
umask 077
while :; do
 stamp=$(date -u +%Y%m%dT%H%M%SZ)
 partial="/backup/mantec-$stamp.archive.gz.partial"
 if mongodump --config=/run/secrets/backup-config --archive="$partial" --gzip --oplog > /tmp/backup.log 2>&1; then
   final="/backup/mantec-$stamp.archive.gz"
   mv "$partial" "$final"
   sha256sum "$final" > "$final.sha256"
   date -u +%s > /backup/last-success
   find /backup -maxdepth 1 -type f -name 'mantec-*.archive.gz*' -mmin +20160 -delete
   echo "BACKUP_OK $stamp"
 else
   echo "BACKUP_FAILED $stamp (details withheld to protect credentials)" >&2
   exit 1
 fi
 sleep 21600
done
