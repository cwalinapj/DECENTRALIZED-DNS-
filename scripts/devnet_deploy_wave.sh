#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLANA_DIR="$ROOT_DIR/solana"
INVENTORY_SCRIPT="$ROOT_DIR/scripts/devnet_inventory.sh"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"
DRY_RUN="${DRY_RUN:-1}"
APPEND_VERIFIED="${APPEND_VERIFIED:-0}"

REQUIRED_PROGRAMS=(
  ddns_anchor
  ddns_registry
  ddns_quorum
  ddns_stake
  ddns_escrow
  ddns_domain_rewards
  ddns_rewards
  ddns_miner_score
  ddns_cache_head
  ddns_witness_rewards
)

for cmd in jq awk sed bc solana anchor; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing_dependency: $cmd" >&2
    exit 1
  fi
done

if [[ ! -f "$INVENTORY_SCRIPT" ]]; then
  echo "missing_inventory_script: $INVENTORY_SCRIPT" >&2
  exit 1
fi

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/artifacts"

run_inventory() {
  set +e
  bash "$INVENTORY_SCRIPT" > "$ROOT_DIR/artifacts/devnet_inventory.latest.md" 2>&1
  local inv_rc=$?
  set -e
  if [[ ! -f "$ROOT_DIR/artifacts/devnet_inventory.json" ]]; then
    echo "inventory_missing_json: artifacts/devnet_inventory.json" >&2
    exit 1
  fi
  return "$inv_rc"
}

is_required() {
  local target="$1"
  for p in "${REQUIRED_PROGRAMS[@]}"; do
    [[ "$p" == "$target" ]] && return 0
  done
  return 1
}

extract_devnet_program_id() {
  local name="$1"
  awk -v key="$name" '
    BEGIN { in_devnet=0 }
    /^\[programs\.devnet\]/ { in_devnet=1; next }
    /^\[/ { if (in_devnet) exit }
    in_devnet {
      gsub(/[[:space:]]+/, "")
      if ($0 ~ "^" key "=\"") {
        split($0, a, "\"")
        print a[2]
        exit
      }
    }
  ' "$SOLANA_DIR/Anchor.toml"
}

calc_buffer_estimate_lamports() {
  local so_path="$1"
  if [[ ! -f "$so_path" ]]; then
    echo 0
    return
  fi
  local bytes
  bytes="$(wc -c < "$so_path" | tr -d ' ')"
  local rent_line rent_lamports
  rent_line="$(solana rent "$bytes" 2>/dev/null || true)"
  if grep -q 'SOL' <<< "$rent_line"; then
    local rent_sol
    rent_sol="$(sed -n 's/.*Rent-exempt minimum:[[:space:]]*\([0-9.][0-9.]*\)[[:space:]]*SOL.*/\1/p' <<< "$rent_line" | head -n1)"
    if [[ -n "$rent_sol" ]]; then
      printf "%.0f\n" "$(echo "$rent_sol * 1000000000" | bc -l)"
      return
    fi
  fi
  rent_lamports="$(sed -n 's/.*Rent-exempt minimum:[[:space:]]*\([0-9][0-9]*\).*/\1/p' <<< "$rent_line" | head -n1)"
  echo "${rent_lamports:-0}"
}

wallet_pubkey="$(solana-keygen pubkey "$WALLET_PATH")"
wallet_sol="$(solana balance -u "$RPC_URL" "$wallet_pubkey" | awk '{print $1}')"
wallet_lamports="$(printf "%.0f" "$(echo "$wallet_sol * 1000000000" | bc -l)")"

run_inventory || true

missing_required=()
while read -r p; do
  [[ -n "$p" ]] && missing_required+=("$p")
done < <(jq -r '.summary.missing_required[]?, .summary.nonexec_required[]?' "$ROOT_DIR/artifacts/devnet_inventory.json" | sort -u)

ordered_missing=()
for p in "${REQUIRED_PROGRAMS[@]}"; do
  for m in "${missing_required[@]:-}"; do
    if [[ "$p" == "$m" ]]; then
      ordered_missing+=("$p")
      break
    fi
  done
done

est_total_lamports=0
plan_rows=()
for prog in "${ordered_missing[@]:-}"; do
  so_path="$SOLANA_DIR/target/deploy/${prog}.so"
  keypair_path="$SOLANA_DIR/target/deploy/${prog}-keypair.json"
  program_id="$(extract_devnet_program_id "$prog")"
  estimate_lamports="$(calc_buffer_estimate_lamports "$so_path")"
  est_total_lamports=$((est_total_lamports + estimate_lamports))
  plan_rows+=("$prog|${program_id:--}|$so_path|$keypair_path|$estimate_lamports")
done

est_total_sol="$(echo "scale=9; $est_total_lamports / 1000000000" | bc -l)"

plan_file="$ROOT_DIR/artifacts/devnet_deploy_wave_plan.md"
{
  echo "# Devnet Deploy Wave Plan"
  echo
  echo "- timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- rpc: $RPC_URL"
  echo "- wallet: $wallet_pubkey"
  echo "- wallet_sol: $wallet_sol"
  echo "- missing_required_count: ${#ordered_missing[@]}"
  echo "- estimated_buffer_lamports_total: $est_total_lamports"
  echo "- estimated_buffer_sol_total: $est_total_sol"
  echo
  echo "| Program | Program ID (Anchor.toml) | .so path | keypair path | Est. buffer lamports |"
  echo "|---|---|---|---|---:|"
  if [[ ${#plan_rows[@]} -eq 0 ]]; then
    echo "| (none) | - | - | - | 0 |"
  else
    for row in "${plan_rows[@]}"; do
      IFS='|' read -r prog pid so keypair est <<< "$row"
      echo "| $prog | \`$pid\` | \`$so\` | \`$keypair\` | $est |"
    done
  fi
} > "$plan_file"

cat "$plan_file"

if [[ "$DRY_RUN" == "1" ]]; then
  echo
  echo "dry_run: true"
  if [[ ${#ordered_missing[@]} -eq 0 ]]; then
    echo "action: no missing REQUIRED programs"
  else
    echo "planned_deploy_order: ${ordered_missing[*]}"
    if (( wallet_lamports < est_total_lamports )); then
      shortfall=$((est_total_lamports - wallet_lamports))
      shortfall_sol="$(echo "scale=9; $shortfall / 1000000000" | bc -l)"
      echo "wallet_shortfall_sol_estimate: $shortfall_sol"
    fi
  fi
  exit 0
fi

if [[ ${#ordered_missing[@]} -eq 0 ]]; then
  echo "no_missing_required_programs"
else
  deploy_log="$ROOT_DIR/artifacts/devnet_deploy_wave.log"
  : > "$deploy_log"

  for prog in "${ordered_missing[@]}"; do
    echo "==> deploying: $prog"
    (
      cd "$SOLANA_DIR"
      anchor build --program-name "$prog"
      anchor deploy --provider.cluster devnet --program-name "$prog"
    ) | tee -a "$deploy_log"

    pid="$(extract_devnet_program_id "$prog")"
    echo "==> verifying: $prog ($pid)"
    solana program show -u "$RPC_URL" "$pid" | tee -a "$deploy_log"
  done
fi

set +e
bash "$INVENTORY_SCRIPT" > "$ROOT_DIR/artifacts/devnet_inventory.after_deploy.md" 2>&1
inv_after_rc=$?
set -e

if [[ "$APPEND_VERIFIED" == "1" ]]; then
  {
    echo
    echo "## Devnet Deploy Wave"
    echo
    echo "Date (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo
    echo "Command:"
    echo '```bash'
    echo "DRY_RUN=$DRY_RUN bash scripts/devnet_deploy_wave.sh"
    echo '```'
    echo
    echo "Output snippet:"
    echo '```text'
    tail -n 20 "$plan_file"
    if [[ -f "$ROOT_DIR/artifacts/devnet_inventory.after_deploy.md" ]]; then
      echo
      tail -n 20 "$ROOT_DIR/artifacts/devnet_inventory.after_deploy.md"
    fi
    echo '```'
    echo
    echo "Exit code: $inv_after_rc"
  } >> "$ROOT_DIR/VERIFIED.md"
fi

if [[ $inv_after_rc -ne 0 ]]; then
  echo "post_deploy_inventory_failed: required programs still missing/non-executable" >&2
  exit 1
fi

echo "deploy_wave_complete"
