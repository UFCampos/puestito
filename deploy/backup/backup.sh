#!/bin/sh
# Backup de PostgreSQL. Sin argumentos: loop cada BACKUP_INTERVAL_HOURS. Con "once": un solo backup.
set -eu

DIR=/backups
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

alert() {
  echo "[backup] ERROR: $1" >&2
  if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -H "Content-Type: application/json" \
      -d "{\"content\":\"🚨 Backup de la base: $1\"}" "$DISCORD_WEBHOOK_URL" >/dev/null || true
  fi
}

run_backup() {
  mkdir -p "$DIR"
  file="$DIR/tupuestito-$(date -u +%Y%m%d-%H%M%S).dump"
  if ! pg_dump -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file"; then
    alert "falló pg_dump"; rm -f "$file"; return 1
  fi
  if [ ! -s "$file" ] || ! pg_restore --list "$file" >/dev/null 2>&1; then
    alert "el archivo $file está vacío o dañado"; return 1
  fi
  echo "[backup] OK $file ($(du -h "$file" | cut -f1))"

  find "$DIR" -name 'tupuestito-*.dump' -mtime +"$RETENTION_DAYS" -delete

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" AWS_DEFAULT_REGION=auto
    if ! aws s3 cp "$file" "s3://$BACKUP_S3_BUCKET/$(basename "$file")" \
      --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" --only-show-errors; then
      alert "no se pudo subir $file a $BACKUP_S3_BUCKET"; return 1
    fi
    echo "[backup] subido a $BACKUP_S3_BUCKET"
  fi
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit $?
fi

while true; do
  run_backup || true
  sleep "$((INTERVAL_HOURS * 3600))"
done
