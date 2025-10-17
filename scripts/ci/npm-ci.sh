#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package-lock.json ]]; then
  echo "[ci] package-lock.json not found in $(pwd)" >&2
  exit 1
fi

npm ci --no-audit --no-fund
