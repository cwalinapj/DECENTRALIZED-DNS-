#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"
DEMO_NAME="${DEMO_NAME:-example.dns}"
DEMO_EPOCH_ID="${DEMO_EPOCH_ID:-0}"

REQUIRED_NAMES=(
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

for cmd in solana solana-keygen awk sed grep jq bc shasum mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing_dependency: $cmd" >&2
    exit 1
  fi
done

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH" >&2
  exit 1
fi

mkdir -p artifacts

is_required() {
  local name="$1"
  for req in "${REQUIRED_NAMES[@]}"; do
    if [[ "$name" == "$req" ]]; then
      return 0
    fi
  done
  return 1
}

to_sol() {
  local lamports="$1"
  echo "scale=9; $lamports / 1000000000" | bc -l
}

tmp_programs="$(mktemp)"
tmp_program_rows="$(mktemp)"
tmp_pda_rows="$(mktemp)"
trap 'rm -f "$tmp_programs" "$tmp_program_rows" "$tmp_pda_rows"' EXIT

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
  echo "error: no [programs.devnet] entries found in solana/Anchor.toml" >&2
  exit 1
fi

wallet_pubkey="$(solana-keygen pubkey "$WALLET_PATH")"
wallet_balance_line="$(solana balance -u "$RPC_URL" "$wallet_pubkey")"
wallet_balance_sol="$(awk '{print $1}' <<< "$wallet_balance_line")"
wallet_balance_lamports="$(printf "%.0f" "$(echo "$wallet_balance_sol * 1000000000" | bc -l)")"

program_count=0
required_total=0
required_ok=0
required_fail=0
optional_missing=0
missing_required_names=()
nonexec_required_names=()

total_program_lamports=0
biggest_program_lamports=0

while read -r name program_id; do
  [[ -z "${name:-}" ]] && continue
  program_count=$((program_count + 1))

  tier="OPTIONAL"
  if is_required "$name"; then
    tier="REQUIRED"
    required_total=$((required_total + 1))
  fi

  show_out="$(solana program show -u "$RPC_URL" "$program_id" 2>&1 || true)"
  if ! grep -q '^Program Id:' <<< "$show_out"; then
    exists="false"
    executable="false"
    owner="-"
    authority="-"
    programdata="-"
    slot="-"
    lamports=0
    sol="0"
    status="missing"

    if [[ "$tier" == "REQUIRED" ]]; then
      required_fail=$((required_fail + 1))
      missing_required_names+=("$name")
    else
      optional_missing=$((optional_missing + 1))
    fi
  else
    exists="true"
    authority="$(sed -n 's/^Authority:[[:space:]]*//p' <<< "$show_out" | head -n1)"
    programdata="$(sed -n 's/^ProgramData Address:[[:space:]]*//p' <<< "$show_out" | head -n1)"
    slot="$(sed -n 's/^Last Deployed In Slot:[[:space:]]*//p' <<< "$show_out" | head -n1)"

    account_json="$(solana account -u "$RPC_URL" "$program_id" --output json 2>/dev/null || true)"
    if [[ -n "$account_json" ]]; then
      lamports="$(jq -r '.account.lamports // 0' <<< "$account_json")"
      executable_json="$(jq -r '.account.executable // false' <<< "$account_json")"
      owner="$(jq -r '.account.owner // "-"' <<< "$account_json")"
    else
      lamports=0
      executable_json="false"
      owner="-"
    fi

    if [[ "$executable_json" == "true" ]]; then
      executable="true"
      status="ok"
      if [[ "$tier" == "REQUIRED" ]]; then
        required_ok=$((required_ok + 1))
      fi
    else
      executable="false"
      status="non_executable"
      if [[ "$tier" == "REQUIRED" ]]; then
        required_fail=$((required_fail + 1))
        nonexec_required_names+=("$name")
      fi
    fi

    sol="$(to_sol "$lamports")"
    total_program_lamports=$((total_program_lamports + lamports))
    if (( lamports > biggest_program_lamports )); then
      biggest_program_lamports=$lamports
    fi
  fi

  jq -nc \
    --arg name "$name" \
    --arg tier "$tier" \
    --arg program_id "$program_id" \
    --arg exists "$exists" \
    --arg executable "$executable" \
    --arg owner "$owner" \
    --arg authority "${authority:-}" \
    --arg programdata "${programdata:-}" \
    --arg slot "${slot:-}" \
    --arg status "$status" \
    --argjson lamports "${lamports:-0}" \
    --arg sol "$sol" \
    '{name:$name,tier:$tier,program_id:$program_id,exists:($exists=="true"),executable:($executable=="true"),owner:$owner,upgrade_authority:$authority,programdata_address:$programdata,last_deploy_slot:$slot,status:$status,lamports:$lamports,sol:$sol}' >> "$tmp_program_rows"
done < "$tmp_programs"

anchor_program_id="$(awk '$1=="ddns_anchor" {print $2}' "$tmp_programs")"
witness_program_id="$(awk '$1=="ddns_witness_rewards" {print $2}' "$tmp_programs")"

name_hash_hex="$(printf '%s' "$DEMO_NAME" | shasum -a 256 | awk '{print $1}')"

derive_pda() {
  local label="$1"
  local program_id="$2"
  shift 2
  local args=("$@")

  if [[ -z "$program_id" ]]; then
    jq -nc --arg label "$label" --arg program "-" '{label:$label,program:$program,derived:false,pda:"-",bump:null,error:"program_not_configured",exists:false,lamports:0,data_len:0,rent_exempt_lamports:0,recommended_topup_lamports:0}' >> "$tmp_pda_rows"
    return
  fi

  local pda_json
  pda_json="$(solana find-program-derived-address -u "$RPC_URL" --output json-compact "$program_id" "${args[@]}" 2>/dev/null || true)"
  local pda
  pda="$(jq -r '.address // empty' <<< "$pda_json" 2>/dev/null || true)"
  local bump
  bump="$(jq -r '.bumpSeed // .bump_seed // empty' <<< "$pda_json" 2>/dev/null || true)"

  if [[ -z "$pda" ]]; then
    jq -nc --arg label "$label" --arg program "$program_id" '{label:$label,program:$program,derived:false,pda:"-",bump:null,error:"pda_derivation_failed",exists:false,lamports:0,data_len:0,rent_exempt_lamports:0,recommended_topup_lamports:0}' >> "$tmp_pda_rows"
    return
  fi

  local account_json
  account_json="$(solana account -u "$RPC_URL" "$pda" --output json 2>/dev/null || true)"
  local exists="false"
  local lamports=0
  local data_len=0
  local rent_exempt=0
  local topup=0

  if [[ -n "$account_json" ]]; then
    exists="true"
    lamports="$(jq -r '.account.lamports // 0' <<< "$account_json")"
    data_len="$(jq -r '.account.space // 0' <<< "$account_json")"
    if [[ "$data_len" =~ ^[0-9]+$ ]] && (( data_len > 0 )); then
      local rent_line
      rent_line="$(solana rent --lamports "$data_len" 2>/dev/null || true)"
      rent_exempt="$(grep -Eo '[0-9]+' <<< "$rent_line" | head -n1)"
      rent_exempt="${rent_exempt:-0}"
      if (( lamports < rent_exempt )); then
        topup=$((rent_exempt - lamports))
      fi
    fi
  fi

  jq -nc \
    --arg label "$label" \
    --arg program "$program_id" \
    --arg pda "$pda" \
    --argjson bump "${bump:-0}" \
    --arg exists "$exists" \
    --argjson lamports "${lamports:-0}" \
    --argjson data_len "${data_len:-0}" \
    --argjson rent_exempt_lamports "${rent_exempt:-0}" \
    --argjson recommended_topup_lamports "${topup:-0}" \
    '{label:$label,program:$program,derived:true,pda:$pda,bump:$bump,exists:($exists=="true"),lamports:$lamports,data_len:$data_len,rent_exempt_lamports:$rent_exempt_lamports,recommended_topup_lamports:$recommended_topup_lamports}' >> "$tmp_pda_rows"
}

# Key PDAs/vaults used by demo flows.
derive_pda "ddns_anchor:config" "$anchor_program_id" string:config
derive_pda "ddns_anchor:toll_pass(wallet)" "$anchor_program_id" string:toll_pass "pubkey:$wallet_pubkey"
derive_pda "ddns_anchor:name_record(example.dns)" "$anchor_program_id" string:name "hex:$name_hash_hex"
derive_pda "ddns_anchor:route_record(wallet,example.dns)" "$anchor_program_id" string:record "pubkey:$wallet_pubkey" "hex:$name_hash_hex"

derive_pda "ddns_witness_rewards:config" "$witness_program_id" string:witness_rewards_config
derive_pda "ddns_witness_rewards:vault_authority" "$witness_program_id" string:witness_rewards_vault_authority
derive_pda "ddns_witness_rewards:bond(wallet)" "$witness_program_id" string:bond "pubkey:$wallet_pubkey"
derive_pda "ddns_witness_rewards:epoch_state(${DEMO_EPOCH_ID})" "$witness_program_id" string:epoch_state "u64le:${DEMO_EPOCH_ID}"
derive_pda "ddns_witness_rewards:epoch_stats(${DEMO_EPOCH_ID},wallet)" "$witness_program_id" string:epoch_stats "u64le:${DEMO_EPOCH_ID}" "pubkey:$wallet_pubkey"

programs_json="$(jq -s '.' "$tmp_program_rows")"
pda_json="$(jq -s '.' "$tmp_pda_rows")"

if ((${#missing_required_names[@]})); then
  missing_required_json="$(printf '%s\n' "${missing_required_names[@]}" | jq -Rsc 'split("\n")[:-1]')"
else
  missing_required_json='[]'
fi
if ((${#nonexec_required_names[@]})); then
  nonexec_required_json="$(printf '%s\n' "${nonexec_required_names[@]}" | jq -Rsc 'split("\n")[:-1]')"
else
  nonexec_required_json='[]'
fi

total_program_sol="$(to_sol "$total_program_lamports")"
recommended_reserve_lamports=$(( (2 * biggest_program_lamports + 1000000000) > 5000000000 ? (2 * biggest_program_lamports + 1000000000) : 5000000000 ))
recommended_reserve_sol="$(to_sol "$recommended_reserve_lamports")"
if (( wallet_balance_lamports < recommended_reserve_lamports )); then
  recommended_wallet_topup_lamports=$((recommended_reserve_lamports - wallet_balance_lamports))
else
  recommended_wallet_topup_lamports=0
fi
recommended_wallet_topup_sol="$(to_sol "$recommended_wallet_topup_lamports")"

jq -n \
  --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg rpc "$RPC_URL" \
  --arg wallet_pubkey "$wallet_pubkey" \
  --arg wallet_path "$WALLET_PATH" \
  --arg wallet_balance_line "$wallet_balance_line" \
  --arg wallet_lamports "$wallet_balance_lamports" \
  --arg wallet_sol "$wallet_balance_sol" \
  --arg demo_name "$DEMO_NAME" \
  --arg demo_epoch_id "$DEMO_EPOCH_ID" \
  --arg required_total "$required_total" \
  --arg required_ok "$required_ok" \
  --arg required_fail "$required_fail" \
  --arg optional_missing "$optional_missing" \
  --arg total_program_lamports "$total_program_lamports" \
  --arg total_program_sol "$total_program_sol" \
  --arg recommended_reserve_lamports "$recommended_reserve_lamports" \
  --arg recommended_reserve_sol "$recommended_reserve_sol" \
  --arg recommended_wallet_topup_lamports "$recommended_wallet_topup_lamports" \
  --arg recommended_wallet_topup_sol "$recommended_wallet_topup_sol" \
  --arg programs_json "$programs_json" \
  --arg pda_json "$pda_json" \
  --arg missing_required_json "$missing_required_json" \
  --arg nonexec_required_json "$nonexec_required_json" \
  '{
    timestamp_utc:$timestamp_utc,
    rpc:$rpc,
    wallet:{
      pubkey:$wallet_pubkey,
      path:$wallet_path,
      balance_line:$wallet_balance_line,
      lamports:($wallet_lamports|tonumber),
      sol:$wallet_sol
    },
    demo_inputs:{
      name:$demo_name,
      epoch_id:($demo_epoch_id|tonumber)
    },
    programs:($programs_json|fromjson),
    pda_checks:($pda_json|fromjson),
    summary:{
      required_total:($required_total|tonumber),
      required_ok:($required_ok|tonumber),
      required_fail:($required_fail|tonumber),
      optional_missing:($optional_missing|tonumber),
      total_program_lamports:($total_program_lamports|tonumber),
      total_program_sol:$total_program_sol,
      recommended_reserve_lamports:($recommended_reserve_lamports|tonumber),
      recommended_reserve_sol:$recommended_reserve_sol,
      recommended_wallet_topup_lamports:($recommended_wallet_topup_lamports|tonumber),
      recommended_wallet_topup_sol:$recommended_wallet_topup_sol,
      missing_required:($missing_required_json|fromjson),
      nonexec_required:($nonexec_required_json|fromjson)
    }
  }' > artifacts/devnet_inventory.json

# Human-readable markdown output
echo "# Devnet Inventory"
echo
echo "- timestamp_utc: $(jq -r '.timestamp_utc' artifacts/devnet_inventory.json)"
echo "- rpc: $(jq -r '.rpc' artifacts/devnet_inventory.json)"
echo "- wallet: $(jq -r '.wallet.pubkey' artifacts/devnet_inventory.json)"
echo "- wallet_balance: $(jq -r '.wallet.balance_line' artifacts/devnet_inventory.json)"
echo "- demo_name: $(jq -r '.demo_inputs.name' artifacts/devnet_inventory.json)"
echo "- demo_epoch_id: $(jq -r '.demo_inputs.epoch_id' artifacts/devnet_inventory.json)"
echo
echo "## Program Inventory (Anchor.toml [programs.devnet])"
echo
echo "| Program | Tier | Program ID | Exists | Executable | Owner | Upgrade Authority | ProgramData | Lamports | SOL | Status |"
echo "|---|---|---|---|---|---|---|---|---:|---:|---|"
jq -r '.programs[] | [ .name, .tier, .program_id, (if .exists then "yes" else "no" end), (if .executable then "yes" else "no" end), .owner, (.upgrade_authority // "-"), (.programdata_address // "-"), (.lamports|tostring), .sol, .status ] | @tsv' artifacts/devnet_inventory.json \
| while IFS=$'\t' read -r name tier pid exists executable owner authority programdata lamports sol status; do
  echo "| $name | $tier | \`$pid\` | $exists | $executable | \`$owner\` | \`$authority\` | \`$programdata\` | $lamports | $sol | $status |"
done

echo
echo "## Key Demo PDAs / Vaults (rent + top-up guidance)"
echo
echo "| Label | Program | PDA | Exists | Lamports | Data Len | Rent Exempt Lamports | Recommended Top-up Lamports |"
echo "|---|---|---|---|---:|---:|---:|---:|"
jq -r '.pda_checks[] | [ .label, .program, .pda, (if .exists then "yes" else "no" end), (.lamports|tostring), (.data_len|tostring), (.rent_exempt_lamports|tostring), (.recommended_topup_lamports|tostring) ] | @tsv' artifacts/devnet_inventory.json \
| while IFS=$'\t' read -r label program pda exists lamports data_len rent topup; do
  echo "| $label | \`$program\` | \`$pda\` | $exists | $lamports | $data_len | $rent | $topup |"
done

echo
echo "## Summary"
echo
echo "- required_total: $(jq -r '.summary.required_total' artifacts/devnet_inventory.json)"
echo "- required_ok: $(jq -r '.summary.required_ok' artifacts/devnet_inventory.json)"
echo "- required_fail: $(jq -r '.summary.required_fail' artifacts/devnet_inventory.json)"
echo "- optional_missing: $(jq -r '.summary.optional_missing' artifacts/devnet_inventory.json)"
echo "- total_program_sol: $(jq -r '.summary.total_program_sol' artifacts/devnet_inventory.json)"
echo "- recommended_reserve_sol: $(jq -r '.summary.recommended_reserve_sol' artifacts/devnet_inventory.json)"
echo "- recommended_wallet_topup_sol: $(jq -r '.summary.recommended_wallet_topup_sol' artifacts/devnet_inventory.json)"

if (( required_fail > 0 )); then
  echo
  echo "required_failures: $(jq -r '.summary.missing_required + .summary.nonexec_required | unique | join(", ")' artifacts/devnet_inventory.json)" >&2
  exit 1
fi

exit 0
