#!/usr/bin/env bash
# Restaura un backup sobre la base de producción. PISA TODOS LOS DATOS.
#   ./deploy/restore.sh tupuestito-20261113-030000.dump --yes
# El archivo tiene que estar en el volumen de backups (o pasá una ruta local).
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ "${2:-}" != "--yes" ]; then
  echo "Uso: $0 <archivo.dump> --yes   (reemplaza la base de datos completa)" >&2
  exit 1
fi
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
set -a; . ./.env.production; set +a

$COMPOSE stop api
if [ -f "$FILE" ]; then
  $COMPOSE cp "$FILE" postgres:/tmp/restore.dump
else
  # Archivo dentro del volumen de backups (el proyecto de compose se llama como la carpeta)
  docker run --rm -v "$(basename "$PWD")_backups:/b:ro" alpine cat "/b/$FILE" > /tmp/restore.dump
  $COMPOSE cp /tmp/restore.dump postgres:/tmp/restore.dump
fi
$COMPOSE exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/restore.dump
$COMPOSE start api
echo "✅ Base restaurada desde $FILE"
