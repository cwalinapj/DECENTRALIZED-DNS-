#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"
APPEND_VERIFIED="${APPEND_VERIFIED:-1}"

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH" >&2
  exit 1
fi

mkdir -p artifacts
stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
log_file="artifacts/proof_devnet_${stamp}.md"
run_log="artifacts/devnet_when_funded_${stamp}.log"

wallet_pubkey="$(solana-keygen pubkey "$WALLET_PATH")"
wallet_sol="$(solana balance -u "$RPC_URL" "$wallet_pubkey" | awk '{print $1}')"

echo "SOLANA_RPC_URL=$RPC_URL"
echo "WALLET_PUBKEY=$wallet_pubkey"
echo "WALLET_SOL=$wallet_sol"

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
DRY_OUT="$(DRY_RUN=1 bash scripts/devnet_deploy_wave.sh | tee "$run_log")"
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
  echo "proof_bundle: $log_file"
  exit 2
fi

echo "==> deploy missing demo-critical programs"
DRY_RUN=0 APPEND_VERIFIED=0 bash scripts/devnet_deploy_wave.sh | tee -a "$run_log"

echo "==> inventory after deploy"
bash scripts/devnet_inventory.sh | tee -a "$run_log"

echo "==> strict demo (no local fallback)"
ALLOW_LOCAL_FALLBACK=0 bash scripts/devnet_happy_path.sh | tee -a "$run_log"

if ! rg -q "✅ demo complete" "$run_log"; then
  echo "strict_demo_missing_success_marker" >&2
  exit 1
fi

TX_LINKS="$(rg -o 'https://explorer\.solana\.com/tx/[^[:space:]]+' "$run_log" | sort -u || true)"
if [[ -n "$TX_LINKS" ]]; then
  echo "==> tx links"
  printf '%s\n' "$TX_LINKS"
fi

echo "✅ STRICT DEMO COMPLETE (ON-CHAIN)"

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

echo "proof_bundle: $log_file"
