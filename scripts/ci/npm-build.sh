#!/usr/bin/env bash
set -euo pipefail

build_script=$(node -p "(() => { try { return require('./package.json').scripts?.build || ''; } catch { return ''; } })()")

if [[ -z "${build_script}" ]]; then
  echo "[ci] No build script defined in package.json for $(pwd)" >&2
  exit 1
fi

npm run build
