#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  "config/environments/devnet.env.example"
  "config/environments/staging.env.example"
  "config/environments/mainnet.env.example"
)

required_keys=(
  "APP_ENV"
  "SOLANA_CLUSTER"
  "SOLANA_RPC_URL"
  "DDNS_PROGRAM_ID"
  "DDNS_REGISTRY_PROGRAM_ID"
  "DDNS_QUORUM_PROGRAM_ID"
  "DDNS_STAKE_PROGRAM_ID"
  "DDNS_NAMES_PROGRAM_ID"
  "GATEWAY_PORT"
  "TOLLBOOTH_PORT"
  "ALLOW_LOCAL_FALLBACK"
)

fail() {
  echo "prod_baseline_check: FAIL - $1" >&2
  exit 1
}

extract_keys() {
  local file="$1"
  sed -n 's/^[[:space:]]*\([A-Z0-9_]\+\)=.*/\1/p' "$file" | sort -u
}

echo "==> prod baseline: environment matrix"
for f in "${required_files[@]}"; do
  [[ -f "$f" ]] || fail "missing required file: $f"
done

for f in "${required_files[@]}"; do
  for k in "${required_keys[@]}"; do
    if ! rg -q "^${k}=" "$f"; then
      fail "$f missing key ${k}"
    fi
  done
done

dev_keys="$(extract_keys config/environments/devnet.env.example)"
staging_keys="$(extract_keys config/environments/staging.env.example)"
mainnet_keys="$(extract_keys config/environments/mainnet.env.example)"

if [[ "$dev_keys" != "$staging_keys" || "$dev_keys" != "$mainnet_keys" ]]; then
  echo "dev keys:"
  printf "%s\n" "$dev_keys"
  echo
  echo "staging keys:"
  printf "%s\n" "$staging_keys"
  echo
  echo "mainnet keys:"
  printf "%s\n" "$mainnet_keys"
  fail "environment example keys do not match"
fi

if rg -q 'REPLACE_ME_' config/environments/devnet.env.example; then
  fail "devnet env example contains unresolved REPLACE_ME values"
fi

echo "==> prod baseline: stale runtime program IDs"
legacy_program_id="EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5"
runtime_dirs=(
  "scripts"
  "services"
  "solana/scripts"
)
if rg -n --glob '!scripts/prod_baseline_check.sh' "$legacy_program_id" "${runtime_dirs[@]}" >/dev/null 2>&1; then
  rg -n --glob '!scripts/prod_baseline_check.sh' "$legacy_program_id" "${runtime_dirs[@]}" || true
  fail "legacy ddns program ID found in runtime code"
fi

echo "==> prod baseline: strict demo defaults"
if ! rg -q 'ALLOW_LOCAL_FALLBACK=0' scripts/devnet_when_funded.sh; then
  fail "strict devnet demo must enforce ALLOW_LOCAL_FALLBACK=0"
fi
if ! rg -q 'STRICT DEMO COMPLETE \(ON-CHAIN\)' scripts/devnet_when_funded.sh; then
  fail "strict devnet demo marker missing"
fi

echo "prod_baseline_check: PASS"
