#!/usr/bin/env bash
set -euo pipefail

# Determine whether a test script is defined.
test_script=$(node -p "(() => { try { return require('./package.json').scripts?.test || ''; } catch { return ''; } })()")

if [[ -z "${test_script}" ]]; then
  echo "[ci] No test script defined in package.json for $(pwd), skipping." >&2
  exit 0
fi

npm test -- --watch=false
