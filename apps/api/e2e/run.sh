#!/usr/bin/env bash
cd "$(dirname "$0")/.."
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable" DATABASE_POOL_MAX=1 LOCAL_STORAGE_DIR=/tmp/tp-storage
rm -rf /tmp/tp-storage
node e2e/pg.mjs > /tmp/tp-pg.log 2>&1 & PG=$!
sleep 2
npx tsx src/seed.ts > /tmp/tp-seed.log 2>&1 || { cat /tmp/tp-seed.log; kill $PG; exit 1; }
npx tsx src/index.ts > /tmp/tp-api.log 2>&1 & API=$!
for i in $(seq 1 40); do curl -s localhost:4000/health >/dev/null && break; sleep 0.5; done
node e2e/flow.mjs; RC=$?
kill $API $PG 2>/dev/null; sleep 0.5
if command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000,55432 -State Listen -EA SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }" >/dev/null 2>&1
fi
exit $RC
