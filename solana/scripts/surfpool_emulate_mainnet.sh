#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$ROOT_DIR/.." && pwd)"

SURFPOOL_HOST="${SURFPOOL_HOST:-127.0.0.1}"
SURFPOOL_PORT="${SURFPOOL_PORT:-8899}"
SURFPOOL_WS_PORT="${SURFPOOL_WS_PORT:-8900}"
SURFPOOL_STUDIO_PORT="${SURFPOOL_STUDIO_PORT:-18488}"
SURFPOOL_NETWORK="${SURFPOOL_NETWORK:-mainnet}"
DRY_RUN="${DRY_RUN:-0}"
ANCHOR_WALLET_PATH="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 2
  fi
}

require_cmd surfpool
require_cmd anchor
require_cmd solana
require_cmd jq
require_cmd npm
require_cmd curl

PLAN_JSON="$(npm -C "$ROOT_DIR" run --silent surfpool:plan -- --section localnet --format json)"
mapfile -t PROGRAM_NAMES < <(printf '%s\n' "$PLAN_JSON" | jq -r '.programs[].name')
if [[ "${#PROGRAM_NAMES[@]}" -eq 0 ]]; then
  echo "no programs found in [programs.localnet]" >&2
  exit 1
fi

echo "surfpool_network: $SURFPOOL_NETWORK"
echo "surfpool_rpc: http://${SURFPOOL_HOST}:${SURFPOOL_PORT}"
echo "surfpool_ws:  ws://${SURFPOOL_HOST}:${SURFPOOL_WS_PORT}"
echo "anchor_wallet: $ANCHOR_WALLET_PATH"
echo "program_count: ${#PROGRAM_NAMES[@]}"
echo "programs: ${PROGRAM_NAMES[*]}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "dry_run: true"
  echo "plan_only: build + deploy + verify all programs listed above"
  exit 0
fi

if [[ ! -f "$ANCHOR_WALLET_PATH" ]]; then
  echo "wallet file not found: $ANCHOR_WALLET_PATH" >&2
  exit 1
fi

SURFPOOL_PID=""
cleanup() {
  if [[ -n "$SURFPOOL_PID" ]] && kill -0 "$SURFPOOL_PID" >/dev/null 2>&1; then
    kill "$SURFPOOL_PID" >/dev/null 2>&1 || true
    wait "$SURFPOOL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> starting surfpool"
(
  cd "$ROOT_DIR"
  surfpool start \
    --network "$SURFPOOL_NETWORK" \
    --host "$SURFPOOL_HOST" \
    --port "$SURFPOOL_PORT" \
    --ws-port "$SURFPOOL_WS_PORT" \
    --studio-port "$SURFPOOL_STUDIO_PORT" \
    --no-tui \
    --ci \
    --yes \
    --legacy-anchor-compatibility \
    --no-deploy
) &
SURFPOOL_PID="$!"

echo "==> waiting for surfpool rpc"
READY=0
for _ in $(seq 1 60); do
  if curl -sSf "http://${SURFPOOL_HOST}:${SURFPOOL_PORT}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [[ "$READY" != "1" ]]; then
  echo "surfpool rpc not reachable at http://${SURFPOOL_HOST}:${SURFPOOL_PORT}" >&2
  exit 1
fi

export ANCHOR_PROVIDER_URL="http://${SURFPOOL_HOST}:${SURFPOOL_PORT}"
export ANCHOR_WALLET="$ANCHOR_WALLET_PATH"

echo "==> optional preflight: program id sync"
if [[ -f "$REPO_DIR/scripts/check_program_id_sync.sh" ]]; then
  bash "$REPO_DIR/scripts/check_program_id_sync.sh" || {
    echo "program id sync check failed; resolve mismatches before emulation deploy" >&2
    exit 1
  }
fi

echo "==> build + deploy + verify all programs"
for prog in "${PROGRAM_NAMES[@]}"; do
  program_id="$(printf '%s\n' "$PLAN_JSON" | jq -r --arg p "$prog" '.programs[] | select(.name == $p) | .programId')"
  echo "---- program: $prog ($program_id)"
  (
    cd "$ROOT_DIR"
    anchor build --program-name "$prog"
    anchor deploy --provider.cluster localnet --program-name "$prog"
  )
  solana -u "$ANCHOR_PROVIDER_URL" program show "$program_id" >/dev/null
done

echo "✅ surfpool emulate-mainnet deployment complete"
