#!/usr/bin/env bash
set -euo pipefail

# C4-B: use a fixed, source-reviewed Compose identity irrespective of pwd.
# Installation is separately gated by C4; this source-only change is not
# authorization to move files or restart a container.
RUNTIME_ROOT="/opt/sanq/runtime"
COMPOSE_FILE="$RUNTIME_ROOT/docker-compose.yml"
ENV_FILE="${1:-$RUNTIME_ROOT/.env}"
PUBLIC_BASE_URL="${2:-https://sanq.ca}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

if [ "$ENV_FILE" != "$RUNTIME_ROOT/.env" ] ||
   [ ! -f "$ENV_FILE" ] || [ -L "$ENV_FILE" ] ||
   [ ! -f "$COMPOSE_FILE" ] || [ -L "$COMPOSE_FILE" ] ||
   [ ! -f "$RUNTIME_ROOT/.sanq-backup-layout-activated" ] ||
   [ -L "$RUNTIME_ROOT/.sanq-backup-layout-activated" ]; then
  echo "SanQ readiness blocked: runtime path/config or C4 activation marker invalid" >&2
  exit 1
fi

ACTIVATION_MARKER="$RUNTIME_ROOT/.sanq-backup-layout-activated"
marker_uid="$(stat -c '%u' -- "$ACTIVATION_MARKER")"
marker_mode="$(stat -c '%a' -- "$ACTIVATION_MARKER")"
if [ "$marker_uid" != "0" ] ||
   (( (8#$marker_mode & 0022) != 0 )) ||
   [ "$(cat -- "$ACTIVATION_MARKER")" != "SANQ_BACKUP_LAYOUT_C4_V1" ]; then
  echo "SanQ readiness blocked: invalid C4 activation marker" >&2
  exit 1
fi

compose=(
  docker compose
  --project-name sanq-app
  --project-directory "$RUNTIME_ROOT"
  -f "$COMPOSE_FILE"
  --env-file "$ENV_FILE"
)

echo "==> Existing Compose project / database volume"
docker volume inspect sanq-app_pgdata >/dev/null
"${compose[@]}" config --quiet

check_http() {
  local label="$1"
  local url="$2"

  echo "==> ${label}: ${url}"
  curl     --fail     --silent     --show-error     --max-time 10     --retry 5     --retry-delay 2     --retry-connrefused     "${url}" >/dev/null
}

echo "==> Compose services"
"${compose[@]}" ps

echo "==> Prisma migration status (read-only verification)"
"${compose[@]}" exec -T api sh -lc   'cd /app/apps/api && npx prisma migrate status --schema=prisma/schema.prisma'

check_http "API readiness" "http://127.0.0.1:4000/api/v1/ready"
check_http "Uber worker readiness" "http://127.0.0.1:4001/ready"
check_http "Web local health" "http://127.0.0.1:3000/health"
check_http "Public Web health" "${PUBLIC_BASE_URL}/health"
check_http "Public Web BFF -> API readiness" "${PUBLIC_BASE_URL}/api/v1/ready"
check_http "Public menu smoke" "${PUBLIC_BASE_URL}/api/v1/menu/public"

echo "Runtime readiness verification passed."
