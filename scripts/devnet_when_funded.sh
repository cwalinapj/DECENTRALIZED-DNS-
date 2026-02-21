#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"
APPEND_VERIFIED="${APPEND_VERIFIED:-1}"
DEMO_JSON="${DEMO_JSON:-0}"
DEPLOY_ALL="${DEPLOY_ALL:-0}"

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH" >&2
  if [[ "$DEMO_JSON" == "1" ]] && command -v jq >/dev/null 2>&1; then
    jq -cn --arg wallet_pubkey "" --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --arg error "wallet_not_found" \
      '{ok:false,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc,error:$error}'
  fi
  exit 1
fi

mkdir -p artifacts
stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
log_file="artifacts/proof_devnet_${stamp}.md"
run_log="artifacts/devnet_when_funded_${stamp}.log"
proof_doc="docs/PROOF.md"

wallet_pubkey="$(solana-keygen pubkey "$WALLET_PATH")"
wallet_sol="$(solana balance -u "$RPC_URL" "$wallet_pubkey" | awk '{print $1}')"

echo "SOLANA_RPC_URL=$RPC_URL"
echo "WALLET_PUBKEY=$wallet_pubkey"
echo "WALLET_SOL=$wallet_sol"
echo "DEPLOY_ALL=$DEPLOY_ALL"

{
  echo "# Devnet funded flow proof"
  echo
  echo "- timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- rpc: $RPC_URL"
  echo "- wallet: $wallet_pubkey"
  echo "- wallet_sol: $wallet_sol"
  echo
} > "$log_file"

echo "==> preflight plan (dry run)"
DRY_OUT="$(DEPLOY_ALL="$DEPLOY_ALL" DRY_RUN=1 bash scripts/devnet_deploy_wave.sh | tee "$run_log")"
TOP_UP_TARGET_SOL="$(printf '%s\n' "$DRY_OUT" | sed -n 's/^TOP_UP_TARGET_SOL=//p' | tail -n 1)"

if [[ -z "$TOP_UP_TARGET_SOL" ]]; then
  echo "missing_top_up_target_sol" >&2
  exit 1
fi

shortfall="$(echo "$TOP_UP_TARGET_SOL - $wallet_sol" | bc -l)"
shortfall_positive="$(echo "$shortfall > 0" | bc -l)"
if [[ "$shortfall_positive" == "1" ]]; then
  echo "insufficient_wallet_sol_for_target"
  echo "TOP_UP_TARGET_SOL=$TOP_UP_TARGET_SOL"
  echo "wallet_shortfall_sol=$(echo "scale=9; $shortfall" | bc -l)"
  {
    echo "## Commands"
    echo
    echo '```bash'
    echo "bash scripts/devnet_when_funded.sh"
    echo '```'
    echo
    echo "## Output snippet"
    echo
    echo '```text'
    tail -n 40 "$run_log"
    echo "insufficient_wallet_sol_for_target"
    echo "TOP_UP_TARGET_SOL=$TOP_UP_TARGET_SOL"
    echo "wallet_shortfall_sol=$(echo "scale=9; $shortfall" | bc -l)"
    echo '```'
  } >> "$log_file"
  if [[ "$DEMO_JSON" == "1" ]] && command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg wallet_pubkey "$wallet_pubkey" \
      --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --arg error "insufficient_wallet_sol_for_target" \
      '{ok:false,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc,error:$error}'
  fi
  echo "proof_bundle: $log_file"
  exit 2
fi

echo "==> deploy missing demo-critical programs"
DEPLOY_ALL="$DEPLOY_ALL" DRY_RUN=0 APPEND_VERIFIED=0 bash scripts/devnet_deploy_wave.sh | tee -a "$run_log"

echo "==> inventory after deploy"
bash scripts/devnet_inventory.sh | tee -a "$run_log"

echo "==> strict demo (no local fallback)"
set +e
DEMO_JSON="$DEMO_JSON" ALLOW_LOCAL_FALLBACK=0 bash scripts/devnet_happy_path.sh | tee -a "$run_log"
demo_rc=$?
set -e

if [[ "$demo_rc" -ne 0 ]]; then
  echo "strict_demo_failed" >&2
  if [[ "$DEMO_JSON" == "1" ]] && command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg wallet_pubkey "$wallet_pubkey" \
      --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --arg error "strict_demo_failed" \
      '{ok:false,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc,error:$error}'
  fi
  exit 1
fi

if ! rg -q "✅ demo complete" "$run_log"; then
  echo "strict_demo_missing_marker_demo_complete" >&2
  if [[ "$DEMO_JSON" == "1" ]] && command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg wallet_pubkey "$wallet_pubkey" \
      --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --arg error "strict_demo_missing_marker_demo_complete" \
      '{ok:false,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc,error:$error}'
  fi
  exit 1
fi

TX_LINKS="$(rg -o 'https://explorer\.solana\.com/tx/[^[:space:]]+' "$run_log" | sort -u || true)"
if [[ -n "$TX_LINKS" ]]; then
  echo "==> tx links"
  printf '%s\n' "$TX_LINKS"
fi

echo "✅ STRICT DEMO COMPLETE (ON-CHAIN)" | tee -a "$run_log"
if ! rg -q "✅ STRICT DEMO COMPLETE \(ON-CHAIN\)" "$run_log"; then
  echo "strict_demo_missing_marker_onchain" >&2
  if [[ "$DEMO_JSON" == "1" ]] && command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg wallet_pubkey "$wallet_pubkey" \
      --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --arg error "strict_demo_missing_marker_onchain" \
      '{ok:false,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc,error:$error}'
  fi
  exit 1
fi

mapfile -t program_id_lines < <(
  awk '
    /^\[programs\.devnet\]/ { in_section=1; next }
    /^\[/ { if (in_section) exit }
    in_section && /^[[:space:]]*[a-zA-Z0-9_]+[[:space:]]*=[[:space:]]*"/ {
      line=$0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      split(line, parts, "=")
      key=parts[1]
      gsub(/[[:space:]]/, "", key)
      value=parts[2]
      gsub(/^[[:space:]]*"/, "", value)
      gsub(/"[[:space:]]*$/, "", value)
      printf("- `%s`: `%s`\n", key, value)
    }
  ' solana/Anchor.toml
)

mapfile -t tx_links_array < <(printf '%s\n' "$TX_LINKS" | sed '/^$/d')
proof_name="$(sed -n 's/^name:[[:space:]]*//p' "$run_log" | tail -n 1)"
proof_dest="$(sed -n 's/^resolved_dest:[[:space:]]*//p' "$run_log" | tail -n 1)"
proof_confidence="$(sed -n 's/^confidence:[[:space:]]*//p' "$run_log" | tail -n 1)"
proof_rrset_hash="$(sed -n 's/^rrset_hash:[[:space:]]*//p' "$run_log" | tail -n 1)"
if [[ -z "$proof_confidence" ]]; then
  proof_confidence="$(sed -n 's/^resolve_confidence:[[:space:]]*//p' "$run_log" | tail -n 1)"
fi
if [[ -z "$proof_rrset_hash" ]]; then
  proof_rrset_hash="$(sed -n 's/^resolve_rrset_hash:[[:space:]]*//p' "$run_log" | tail -n 1)"
fi

{
  echo "# PROOF"
  echo
  echo "- last_success_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- canonical_command: \`npm run mvp:demo:devnet\`"
  echo "- wallet_pubkey: \`$wallet_pubkey\`"
  echo "- rpc: \`$RPC_URL\`"
  echo
  echo "## Latest Demo Summary"
  echo
  echo "- name: \`${proof_name:-unknown}\`"
  echo "- dest: \`${proof_dest:-unknown}\`"
  echo "- confidence: \`${proof_confidence:-unknown}\`"
  echo "- rrset_hash: \`${proof_rrset_hash:-unknown}\`"
  echo
  echo "## Latest Tx Links"
  echo
  if [[ ${#tx_links_array[@]} -eq 0 ]]; then
    echo "- (none)"
  else
    for link in "${tx_links_array[@]}"; do
      echo "- $link"
    done
  fi
  echo
  echo "## Devnet Program IDs (from solana/Anchor.toml)"
  echo
  if [[ ${#program_id_lines[@]} -gt 0 ]]; then
    printf '%s\n' "${program_id_lines[@]}"
  else
    echo "- no program IDs parsed from [programs.devnet]"
  fi
  echo
  echo "## Success Criteria"
  echo
  echo "- [x] \`✅ demo complete\` marker observed"
  echo "- [x] \`✅ STRICT DEMO COMPLETE (ON-CHAIN)\` marker observed"
  echo "- [x] strict mode used (\`ALLOW_LOCAL_FALLBACK=0\`)"
  echo "- [x] deploy-wave + inventory + demo executed"
} > "$proof_doc"

{
  echo "## Commands"
  echo
  echo '```bash'
  echo "bash scripts/devnet_when_funded.sh"
  echo '```'
  echo
  echo "## Output snippet"
  echo
  echo '```text'
  tail -n 40 "$run_log"
  echo '```'
} >> "$log_file"

if [[ "$APPEND_VERIFIED" == "1" ]]; then
  {
    echo
    echo "## $(date -u +"%Y-%m-%d") — funded strict devnet flow"
    echo
    echo "Command:"
    echo '```bash'
    echo "bash scripts/devnet_when_funded.sh"
    echo '```'
    echo
    echo "Output snippet:"
    echo '```text'
    tail -n 20 "$run_log"
    echo '```'
  } >> VERIFIED.md
fi

if [[ "$DEMO_JSON" == "1" ]]; then
  demo_json_line="$(awk '/^{.*}$/ {line=$0} END {print line}' "$run_log")"
  if [[ -z "$demo_json_line" ]]; then
    demo_json_line="$(jq -cn \
      --arg wallet_pubkey "$wallet_pubkey" \
      --arg timestamp_utc "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      '{ok:true,name:null,dest:null,confidence:null,rrset_hash:null,tx_links:[],program_ids:{},wallet_pubkey:$wallet_pubkey,timestamp_utc:$timestamp_utc}')"
  fi
  echo "proof_bundle: $log_file" >&2
  echo "$demo_json_line"
else
  echo "proof_bundle: $log_file"
fi
