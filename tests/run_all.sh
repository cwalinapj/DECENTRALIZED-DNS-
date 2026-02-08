#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_pkg() {
  local dir="$1"
  local cmd="$2"
  echo "==> $dir: $cmd"
  (cd "$dir" && eval "$cmd")
}

run_pkg "$root/gateway" "npm ci && npm run lint && npm run build && npm test"
run_pkg "$root/core" "npm ci && npm run build && npm test"
run_pkg "$root/coordinator" "npm ci && npm test"

echo "==> tests/smoke: /resolve"
(cd "$root" && bash tests/smoke/resolve.sh)

echo "==> tests/node-name"
(cd "$root" && node tests/node-name.test.mjs)

echo "==> tests/conformance: adapters"
(cd "$root" && node tests/conformance/adapter_contract.test.mjs)
