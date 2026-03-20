#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNS="${RUNS:-3}"
DEMO_WALLET_MODE="${DEMO_WALLET_MODE:-persistent_client}"
DEMO_INTERACTIONS="${DEMO_INTERACTIONS:-3}"
DDNS_SKIP_DEPLOY_VERIFY="${DDNS_SKIP_DEPLOY_VERIFY:-1}"

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
  echo "invalid RUNS: $RUNS (expected integer >= 1)" >&2
  exit 1
fi

mkdir -p artifacts
stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
metrics_path="artifacts/devnet_usage_metrics_${stamp}.json"
summary_path="artifacts/devnet_usage_metrics_${stamp}.md"
tmp_jsonl="$(mktemp)"
trap 'rm -f "$tmp_jsonl"' EXIT

echo "==> repeated devnet usage run"
echo "runs: $RUNS"
echo "demo_wallet_mode: $DEMO_WALLET_MODE"
echo "demo_interactions: $DEMO_INTERACTIONS"

for ((i=1; i<=RUNS; i++)); do
  echo "==> usage iteration $i/$RUNS"
  iter_log="artifacts/devnet_usage_run_${stamp}_${i}.log"
  set +e
  DEMO_JSON=1 \
  DDNS_SKIP_DEPLOY_VERIFY="$DDNS_SKIP_DEPLOY_VERIFY" \
  DEMO_WALLET_MODE="$DEMO_WALLET_MODE" \
  DEMO_INTERACTIONS="$DEMO_INTERACTIONS" \
  bash scripts/devnet_happy_path.sh >"$iter_log" 2>&1
  rc=$?
  set -e

  json_line="$(awk '/^{.*}$/ {line=$0} END {print line}' "$iter_log")"
  if [[ -z "$json_line" ]]; then
    jq -cn \
      --arg iteration "$i" \
      --arg ok "false" \
      --arg error "missing_demo_json_output" \
      --arg log "$iter_log" \
      '{iteration:($iteration|tonumber),ok:($ok=="true"),error:$error,log_path:$log}' >> "$tmp_jsonl"
    continue
  fi

  jq -cn \
    --argjson payload "$json_line" \
    --arg iteration "$i" \
    --arg rc "$rc" \
    --arg log "$iter_log" \
    '{
      iteration: ($iteration|tonumber),
      exit_code: ($rc|tonumber),
      ok: ($payload.ok // false),
      wallet_pubkey: ($payload.wallet_pubkey // null),
      name: ($payload.name // null),
      dest: ($payload.dest // null),
      tx_links: ($payload.tx_links // []),
      error: ($payload.error // null),
      timestamp_utc: ($payload.timestamp_utc // null),
      log_path: $log
    }' >> "$tmp_jsonl"
done

jq -s '
  . as $runs |
  {
    generated_at_utc: (now | todate),
    runs_requested: ($runs | length),
    runs_successful: ($runs | map(select(.ok == true)) | length),
    unique_wallets: ($runs | map(.wallet_pubkey) | map(select(. != null and . != "")) | unique),
    total_tx_links: ($runs | map(.tx_links | length) | add),
    runs: $runs
  }
' "$tmp_jsonl" > "$metrics_path"

jq -r '
  "# Devnet Usage Metrics",
  "",
  "- generated_at_utc: \(.generated_at_utc)",
  "- runs_requested: \(.runs_requested)",
  "- runs_successful: \(.runs_successful)",
  "- unique_wallet_count: \(.unique_wallets | length)",
  "- total_tx_links: \(.total_tx_links)",
  "",
  "## Wallets",
  (if (.unique_wallets | length) == 0 then "- (none)" else (.unique_wallets[] | "- `\(.)`") end),
  "",
  "## Run Outcomes",
  (.runs[] | "- iteration \(.iteration): ok=\(.ok) exit_code=\(.exit_code) name=\(.name // "n/a") error=\(.error // "none")")
' "$metrics_path" > "$summary_path"

echo "usage_metrics_json: $metrics_path"
echo "usage_metrics_summary: $summary_path"
