#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[dashboard-report] missing command: $1" >&2
    exit 2
  fi
}

require_cmd jq

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$ROOT_DIR/reports/latest.json"

PROOF_FILE="$ROOT_DIR/docs/PROOF.md"
VERIFIED_FILE="$ROOT_DIR/VERIFIED.md"
INVENTORY_FILE="$ROOT_DIR/artifacts/devnet_inventory.json"
STATUS_FILE="$ROOT_DIR/docs/STATUS.md"

timestamp_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_sha="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")"
branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"

demo_ok="false"
if [[ -f "$PROOF_FILE" ]] && grep -Eq 'STRICT DEMO COMPLETE \(ON-CHAIN\)' "$PROOF_FILE"; then
  demo_ok="true"
fi

program_id_sync_ok="false"
if [[ -f "$VERIFIED_FILE" ]] && grep -Eq '\[id-check\] PASS|program id sync.*PASS' "$VERIFIED_FILE"; then
  program_id_sync_ok="true"
fi

root_tests_seen="false"
if [[ -f "$VERIFIED_FILE" ]] && grep -Eq 'npm ci && npm test|run_all: complete' "$VERIFIED_FILE"; then
  root_tests_seen="true"
fi

inventory_present="false"
inventory_required_missing=0
if [[ -f "$INVENTORY_FILE" ]]; then
  inventory_present="true"
  inventory_required_missing="$(jq -r '.required_failures | length // 0' "$INVENTORY_FILE" 2>/dev/null || echo 0)"
fi

status_has_mvp_ready="false"
if [[ -f "$STATUS_FILE" ]] && grep -Eqi 'mvp ready|strict demo complete' "$STATUS_FILE"; then
  status_has_mvp_ready="true"
fi

if [[ -f "$PROOF_FILE" ]]; then
  tx_links_json="$((grep -Eo 'https://explorer\.solana\.com/tx/[A-Za-z0-9?=&._-]+' "$PROOF_FILE" || true) | head -n 8 | jq -R . | jq -s .)"
else
  tx_links_json='[]'
fi

notes_json="$(jq -n \
  --arg demo_source "$( [[ -f "$PROOF_FILE" ]] && echo "docs/PROOF.md" || echo "missing" )" \
  --arg inventory_source "$( [[ -f "$INVENTORY_FILE" ]] && echo "artifacts/devnet_inventory.json" || echo "missing" )" \
  --arg verified_source "$( [[ -f "$VERIFIED_FILE" ]] && echo "VERIFIED.md" || echo "missing" )" \
  '[
    "Read-only dashboard report generated from existing repository outputs.",
    "No dependency updates or automatic PR creation are performed by this script.",
    ("demo source: " + $demo_source),
    ("inventory source: " + $inventory_source),
    ("verification source: " + $verified_source)
  ]')"

mkdir -p "$(dirname "$OUT_FILE")"

jq -n \
  --arg timestamp_utc "$timestamp_utc" \
  --arg git_sha "$git_sha" \
  --arg branch "$branch" \
  --argjson demo_ok "$demo_ok" \
  --argjson tx_links "$tx_links_json" \
  --argjson notes "$notes_json" \
  --argjson commands '[
    "npm ci && npm test",
    "bash scripts/check_program_id_sync.sh",
    "npm run mvp:demo:devnet",
    "bash scripts/devnet_inventory.sh"
  ]' \
  --argjson results "$(jq -n \
    --argjson root_tests_seen "$root_tests_seen" \
    --argjson program_id_sync_ok "$program_id_sync_ok" \
    --argjson inventory_present "$inventory_present" \
    --argjson inventory_required_missing "$inventory_required_missing" \
    --argjson status_has_mvp_ready "$status_has_mvp_ready" \
    '[
      {
        name: "root_tests",
        status: (if $root_tests_seen then "seen" else "missing" end),
        detail: "Observed from VERIFIED.md markers"
      },
      {
        name: "program_id_sync",
        status: (if $program_id_sync_ok then "pass-marker-seen" else "unknown" end),
        detail: "Observed from VERIFIED.md markers"
      },
      {
        name: "devnet_inventory",
        status: (if $inventory_present then (if $inventory_required_missing == 0 then "pass" else "fail" end) else "missing" end),
        detail: (if $inventory_present then ("required_failures=" + ($inventory_required_missing|tostring)) else "inventory file missing" end)
      },
      {
        name: "status_doc",
        status: (if $status_has_mvp_ready then "mvp-ready-marker-seen" else "unknown" end),
        detail: "Observed from docs/STATUS.md"
      }
    ]')" \
  '{
    timestamp_utc: $timestamp_utc,
    git_sha: $git_sha,
    branch: $branch,
    commands: $commands,
    results: $results,
    demo_ok: $demo_ok,
    tx_links: $tx_links,
    notes: $notes
  }' > "$OUT_FILE"

echo "[dashboard-report] wrote $OUT_FILE"
