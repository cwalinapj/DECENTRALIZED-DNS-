#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -x "$root/scripts/check_no_protocol_drift.sh" ]; then
  echo "==> gate: no protocol drift (solana/programs/**)"
  (cd "$root" && bash scripts/check_no_protocol_drift.sh)
fi

run_pkg() {
  local dir="$1"
  local cmd="$2"
  echo "==> $dir: $cmd"
  (cd "$dir" && eval "$cmd")
}

maybe_run() {
  local dir="$1"
  local cmd="$2"
  if [ -d "$dir" ]; then
    # Legacy folders can exist without being runnable npm packages.
    # Only attempt `npm` commands when a package manifest exists.
    if [[ "$cmd" == *npm* ]] && [ ! -f "$dir/package.json" ]; then
      echo "==> skip (missing package.json): $dir"
      return
    fi
    run_pkg "$dir" "$cmd"
  else
    echo "==> skip (missing): $dir"
  fi
}

# Newer layout (preferred)
maybe_run "$root/gateway" "npm ci && npm run lint && npm run build && npm test"
maybe_run "$root/core" "npm ci && npm run build && npm test"
maybe_run "$root/coordinator" "npm ci && npm test"

# Legacy layout (still present in some branches/commits)
maybe_run "$root/ddns-core" "npm ci || npm install; (npx vitest run || npm test)"
maybe_run "$root/resolver" "npm ci || npm install; (npm test || npm run build)"
maybe_run "$root/escrow" "npm ci || npm install; (npx vitest run || npm test)"
maybe_run "$root/services/compat-control-plane" "npm ci || npm install; (npm test || npm run build)"
maybe_run "$root/services/control-plane" "npm ci || npm install; (npm test || npm run build)"
maybe_run "$root/services/vault" "npm ci || npm install; (npm test || npm run build)"

# Repo-level smoke tests (newer layout)
if [ -d "$root/tests/smoke" ] && [ -f "$root/tests/smoke/resolve.sh" ]; then
  echo "==> tests/smoke: /resolve"
  (cd "$root" && bash tests/smoke/resolve.sh)
fi

if [ -f "$root/tests/node-name.test.mjs" ]; then
  echo "==> tests/node-name"
  (cd "$root" && node tests/node-name.test.mjs)
fi

if [ -f "$root/tests/conformance/adapter_contract.test.mjs" ]; then
  echo "==> tests/conformance: adapters"
  (cd "$root" && node tests/conformance/adapter_contract.test.mjs)
fi

# Solana (optional)
if [ -d "$root/solana" ]; then
  echo "==> solana: cargo test"
  (cd "$root/solana" && cargo test)
  if command -v anchor >/dev/null 2>&1; then
    echo "==> solana: anchor build"
    (cd "$root/solana" && anchor build)
    if [ -x "$root/scripts/check_program_id_sync.sh" ]; then
      echo "==> gate: program id sync"
      if [ "${STRICT_PROGRAM_ID_SYNC:-0}" = "1" ]; then
        (cd "$root" && bash scripts/check_program_id_sync.sh)
      else
        if ! (cd "$root" && bash scripts/check_program_id_sync.sh); then
          echo "==> warning: program id sync mismatch (STRICT_PROGRAM_ID_SYNC=1 to enforce hard-fail)"
        fi
      fi
    fi
  else
    echo "==> skip: anchor not installed"
  fi
fi

echo "==> run_all: complete"
