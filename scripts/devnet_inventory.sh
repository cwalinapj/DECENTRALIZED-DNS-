#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH"
  exit 1
fi

for cmd in solana solana-keygen awk sed grep jq bc; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing_dependency: $cmd"
    exit 1
  fi
done

tmp_programs="$(mktemp)"
tmp_json="$(mktemp)"
trap 'rm -f "$tmp_programs" "$tmp_json"' EXIT

awk '
  BEGIN { in_devnet=0 }
  /^\[programs\.devnet\]/ { in_devnet=1; next }
  /^\[/ { if (in_devnet) exit }
  in_devnet && $0 ~ /^[a-zA-Z0-9_]+[[:space:]]*=[[:space:]]*"/ {
    split($0, a, "=")
    gsub(/[[:space:]]/, "", a[1])
    gsub(/[[:space:]]/, "", a[2])
    gsub(/"/, "", a[2])
    print a[1] " " a[2]
  }
' "$ROOT_DIR/solana/Anchor.toml" > "$tmp_programs"

if [[ ! -s "$tmp_programs" ]]; then
  echo "error: no [programs.devnet] entries found in solana/Anchor.toml"
  exit 1
fi

wallet_pubkey="$(solana-keygen pubkey "$WALLET_PATH")"
wallet_balance_line="$(solana balance -u "$RPC_URL" "$wallet_pubkey")"
wallet_balance_sol="$(awk '{print $1}' <<< "$wallet_balance_line")"
wallet_balance_lamports="$(printf "%.0f" "$(echo "$wallet_balance_sol * 1000000000" | bc -l)")"

fmt_sol() {
  local v="$1"
  if [[ "$v" == .* ]]; then
    echo "0$v"
  else
    echo "$v"
  fi
}

echo "## Devnet Inventory"
echo "timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "rpc: $RPC_URL"
echo
echo "## Wallet + RPC"
solana config get
echo "solana address: $wallet_pubkey"
echo "solana balance: $wallet_balance_line"

program_count=0
total_program_lamports=0
max_program_lamports=0

echo
echo "## Program Inventory (from solana/Anchor.toml [programs.devnet])"
while read -r name program_id; do
  [[ -z "${name:-}" ]] && continue
  program_count=$((program_count + 1))
  echo
  echo "[$name] $program_id"

  show_out="$(solana program show -u "$RPC_URL" "$program_id" 2>&1 || true)"
  if ! grep -q "Program Id:" <<< "$show_out"; then
    echo "program_show_error: $show_out"
    continue
  fi

  program_data="$(grep -E '^ProgramData Address:' <<< "$show_out" | sed -E 's/^ProgramData Address:[[:space:]]*//' || true)"
  authority="$(grep -E '^Authority:' <<< "$show_out" | sed -E 's/^Authority:[[:space:]]*//' || true)"
  executable="$(grep -E '^Executable:' <<< "$show_out" | sed -E 's/^Executable:[[:space:]]*//' || true)"

  account_json="$(solana account -u "$RPC_URL" "$program_id" --output json 2>/dev/null || true)"
  if [[ -n "$account_json" ]]; then
    lamports="$(jq -r '.account.lamports // 0' <<< "$account_json")"
    owner="$(jq -r '.account.owner // "unknown"' <<< "$account_json")"
    [[ -z "${executable:-}" ]] && executable="$(jq -r '.account.executable // "unknown"' <<< "$account_json")"
  else
    lamports=0
    owner="unknown"
  fi
  sol="$(fmt_sol "$(echo "scale=9; $lamports / 1000000000" | bc -l)")"

  total_program_lamports=$((total_program_lamports + lamports))
  if (( lamports > max_program_lamports )); then
    max_program_lamports=$lamports
  fi

  echo "program_id: $program_id"
  echo "owner: $owner"
  echo "upgrade_authority: ${authority:-unknown}"
  echo "programdata_address: ${program_data:-unknown}"
  echo "executable: ${executable:-unknown}"
  echo "lamports: $lamports"
  echo "sol: $sol"
done < "$tmp_programs"

recommended_reserve_lamports=$(( (2 * max_program_lamports + 1000000000) > 5000000000 ? (2 * max_program_lamports + 1000000000) : 5000000000 ))
recommended_reserve_sol="$(echo "scale=9; $recommended_reserve_lamports / 1000000000" | bc -l)"

if (( wallet_balance_lamports < recommended_reserve_lamports )); then
  wallet_topup_lamports=$((recommended_reserve_lamports - wallet_balance_lamports))
else
  wallet_topup_lamports=0
fi
wallet_topup_sol="$(echo "scale=9; $wallet_topup_lamports / 1000000000" | bc -l)"
total_program_sol="$(fmt_sol "$(echo "scale=9; $total_program_lamports / 1000000000" | bc -l)")"

echo
echo "## Rent / Top-up Guidance"
echo "note: this script reports deployed program accounts + deploy wallet deterministically."
echo "note: key PDA/vault derivations for demo flows vary by program and are audited in the next pass."
echo "todo_next_pda_audit:"
echo "  - ddns_anchor config/toll_pass/name_record/route_record"
echo "  - ddns_witness_rewards config/reward_vault/bond/epoch_state/epoch_stats"
echo
echo "## Summary"
echo "programs_count: $program_count"
echo "total_program_lamports: $total_program_lamports"
echo "total_program_sol: $total_program_sol"
echo "wallet_lamports: $wallet_balance_lamports"
echo "wallet_sol: $wallet_balance_sol"
echo "recommended_reserve_lamports: $recommended_reserve_lamports"
echo "recommended_reserve_sol: $recommended_reserve_sol"
echo "recommended_wallet_topup_lamports: $wallet_topup_lamports"
echo "recommended_wallet_topup_sol: $wallet_topup_sol"
