#!/usr/bin/env bash
# Tests end-to-end de la API en un entorno AISLADO:
# PostgreSQL embebido en :55432 y API en :4100, para no tocar nunca el entorno de
# desarrollo (API :4000 / Postgres :5432) aunque esté corriendo al mismo tiempo.
cd "$(dirname "$0")/.."

E2E_API_PORT=4100
E2E_PG_PORT=55432
E2E_STORAGE="${TMPDIR:-/tmp}/tp-e2e-storage"

export PORT=$E2E_API_PORT
export API_URL="http://localhost:$E2E_API_PORT"
export WEB_URL="http://localhost:3000"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:$E2E_PG_PORT/postgres?sslmode=disable"
export DATABASE_POOL_MAX=1
export STORAGE_DRIVER=local LOCAL_STORAGE_DIR="$E2E_STORAGE"
export PAYMENTS_MODE=mock NODE_ENV=development
export MAX_FINAL_DELIVERY_MB=2   # límite chico para poder probar el rechazo por tamaño

if curl -s -o /dev/null "http://localhost:$E2E_API_PORT/health"; then
  echo "❌ Ya hay algo escuchando en :$E2E_API_PORT. Cerralo antes de correr los tests." >&2
  exit 1
fi

rm -rf "$E2E_STORAGE"
PG_PORT=$E2E_PG_PORT node e2e/pg.mjs > /tmp/tp-pg.log 2>&1 & PG=$!
cleanup() { kill "$API" "$PG" 2>/dev/null; wait "$API" "$PG" 2>/dev/null; }
trap cleanup EXIT
sleep 2

node --import tsx src/seed.ts > /tmp/tp-seed.log 2>&1 || { cat /tmp/tp-seed.log; exit 1; }
node --import tsx src/index.ts > /tmp/tp-api.log 2>&1 & API=$!

READY=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "$API_URL/health"; then READY=1; break; fi
  sleep 0.5
done
if [ "$READY" != 1 ]; then echo "❌ La API de test no levantó:" >&2; tail -20 /tmp/tp-api.log >&2; exit 1; fi

node e2e/flow.mjs
