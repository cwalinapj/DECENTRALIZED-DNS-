#!/usr/bin/env bash
set -euo pipefail

root="/Users/root1/dev/web3-repos/DECENTRALIZED-DNS-"

run_pkg() {
  local dir="$1"
  local cmd="$2"
  echo "==> $dir: $cmd"
  (cd "$dir" && eval "$cmd")
}

run_pkg "$root/resolver" "npm install && npm run build && npm test"
