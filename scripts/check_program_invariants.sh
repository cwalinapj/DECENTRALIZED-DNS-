#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ANCHOR_TOML="solana/Anchor.toml"
[[ -f "$ANCHOR_TOML" ]] || { echo "missing $ANCHOR_TOML" >&2; exit 1; }

fail() {
  echo "program_invariants: FAIL - $1" >&2
  exit 1
}

required_programs=(ddns_anchor ddns_registry ddns_quorum ddns_stake ddns_names)

read_section() {
  local section="$1"
  awk -v sec="$section" '
    $0 ~ "^\\[" sec "\\]" { in_section=1; next }
    /^\[/ && in_section { exit }
    in_section && /^[[:space:]]*[a-zA-Z0-9_]+[[:space:]]*=[[:space:]]*"/ { print }
  ' "$ANCHOR_TOML"
}

devnet_entries="$(read_section "programs.devnet")"
localnet_entries="$(read_section "programs.localnet")"

[[ -n "$devnet_entries" ]] || fail "empty [programs.devnet] section"
[[ -n "$localnet_entries" ]] || fail "empty [programs.localnet] section"

for prog in "${required_programs[@]}"; do
  if ! printf '%s\n' "$devnet_entries" | rg -q "^[[:space:]]*${prog}[[:space:]]*="; then
    fail "missing required devnet program: $prog"
  fi
done

dev_ids="$(printf '%s\n' "$devnet_entries" | sed -E 's/.*=[[:space:]]*"([^"]+)".*/\1/' | sort)"
if [[ "$(printf '%s\n' "$dev_ids" | uniq -d | wc -l | tr -d ' ')" != "0" ]]; then
  printf '%s\n' "$dev_ids" | uniq -d
  fail "duplicate program IDs found in [programs.devnet]"
fi

if ! rg -q '^\[provider\]' "$ANCHOR_TOML"; then
  fail "missing [provider] section"
fi
if ! rg -q '^[[:space:]]*cluster[[:space:]]*=[[:space:]]*"localnet"' "$ANCHOR_TOML"; then
  fail "provider.cluster must remain localnet in repo defaults"
fi

echo "program_invariants: PASS"
