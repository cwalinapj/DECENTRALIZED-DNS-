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
