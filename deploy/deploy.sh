#!/usr/bin/env bash
# Deploy en el VPS, desde la raíz del repo:  ./deploy/deploy.sh
# Volver atrás:  git checkout <sha anterior> && ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.production ] || { echo "❌ Falta .env.production (copiá .env.production.example)" >&2; exit 1; }
set -a; . ./.env.production; set +a
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

export APP_VERSION="$(git rev-parse --short HEAD)"
echo "🚀 Desplegando $APP_VERSION"

# Backup previo (en el primer deploy todavía no hay base: no es error)
if $COMPOSE ps --status running postgres 2>/dev/null | grep -q postgres; then
  $COMPOSE build backup >/dev/null
  $COMPOSE run --rm backup once || echo "⚠️ No se pudo hacer el backup previo"
fi

$COMPOSE up -d --build

echo "⏳ Esperando a la API…"
for _ in $(seq 1 60); do
  if curl -fsS -m 5 "https://${API_DOMAIN}/health" 2>/dev/null | grep -q "\"$APP_VERSION\""; then
    echo "✅ API $APP_VERSION en línea"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "❌ La API no respondió con la versión nueva. Últimos logs:" >&2
$COMPOSE logs --tail=60 api >&2
exit 1
