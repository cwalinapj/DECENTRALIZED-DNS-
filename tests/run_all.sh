#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_pkg() {
  local dir="$1"
  local cmd="$2"
  echo "==> $dir: $cmd"
  (cd "$dir" && eval "$cmd")
}

run_pkg "$root/resolver" "npm ci && npm run lint && npm run build && npm test"
run_pkg "$root/ddns-core" "npm ci && npm run build && npm test"
run_pkg "$root/services/control-plane/credits-coordinator" "npm ci && npm test"
run_pkg "$root/workers/node-agent" "npm ci && npm run build"
run_pkg "$root/services/pages-hosting" "npm ci && npm test"
run_pkg "$root/services/builder-api" "npm ci && npm test"
run_pkg "$root/workers/site-builder" "npm ci && npm test"

echo "==> tests/smoke: /resolve"
(cd "$root" && bash tests/smoke/resolve.sh)

echo "==> tests/conformance: adapters"
(cd "$root" && node tests/conformance/adapter_contract.test.mjs)
