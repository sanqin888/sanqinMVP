#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/etc/sanqin/sanqin.env}"
PUBLIC_BASE_URL="${2:-https://sanq.ca}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

compose=(docker compose --env-file "${ENV_FILE}")

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
