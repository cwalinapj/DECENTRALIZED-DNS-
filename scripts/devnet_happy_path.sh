#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
WALLET_PATH="${WALLET:-${ANCHOR_WALLET:-$HOME/.config/solana/id.json}}"
CLIENT_WALLET_PATH="${CLIENT_WALLET:-}"
GATEWAY_PORT="${GATEWAY_PORT:-8054}"
TOLLBOOTH_PORT="${TOLLBOOTH_PORT:-8788}"
DEMO_DEST="${DEMO_DEST:-https://example.com}"
DEMO_TTL="${DEMO_TTL:-300}"
ENABLE_WITNESS_REWARDS="${ENABLE_WITNESS_REWARDS:-0}"

LOG_DIR="${TMPDIR:-/tmp}/ddns-devnet-demo"
mkdir -p "$LOG_DIR"

cleanup() {
  set +e
  if [[ -n "${GATEWAY_PID:-}" ]]; then kill "$GATEWAY_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${TOLLBOOTH_PID:-}" ]]; then kill "$TOLLBOOTH_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

if [[ ! -f "$WALLET_PATH" ]]; then
  echo "wallet_not_found: $WALLET_PATH"
  exit 1
fi

if [[ -z "$CLIENT_WALLET_PATH" ]]; then
  CLIENT_WALLET_PATH="$LOG_DIR/demo-client.json"
fi
if [[ ! -f "$CLIENT_WALLET_PATH" ]]; then
  solana-keygen new --no-bip39-passphrase -o "$CLIENT_WALLET_PATH" -f >/dev/null
fi

wait_http() {
  local url="$1"
  local tries="${2:-40}"
  local i=0
  while (( i < tries )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

extract_tx() {
  local blob="$1"
  printf "%s\n" "$blob" | rg -o "tx: '[^']+'" | sed -E "s/tx: '([^']+)'/\1/" | head -n 1 || true
}

echo "==> verify deployed MVP programs on devnet"
npm -C solana run devnet:verify

echo "==> devnet funding/rent snapshot"
npm -C solana run devnet:audit

WALLET_PUBKEY="$(solana-keygen pubkey "$WALLET_PATH")"
CLIENT_WALLET_PUBKEY="$(solana-keygen pubkey "$CLIENT_WALLET_PATH")"
DEMO_LABEL="${DEMO_LABEL:-u-$(printf "%s" "$CLIENT_WALLET_PUBKEY" | tr 'A-Z' 'a-z' | cut -c1-8)}"
DEMO_NAME="${DEMO_NAME:-${DEMO_LABEL}.dns}"

echo "wallet: $WALLET_PUBKEY"
echo "client_wallet: $CLIENT_WALLET_PUBKEY"
echo "rpc: $RPC_URL"
echo "demo_name: $DEMO_NAME"

echo "==> init names config PDA (idempotent; continue if already initialized)"
set +e
NAMES_INIT_OUT="$(
  npm -C solana run names -- \
    --rpc "$RPC_URL" \
    --wallet "$WALLET_PATH" \
    init-config 2>&1
)"
NAMES_INIT_RC=$?
set -e
if [[ $NAMES_INIT_RC -eq 0 ]]; then
  echo "$NAMES_INIT_OUT" | tail -n 20
else
  echo "names_init_skipped_or_exists: $NAMES_INIT_RC"
  echo "$NAMES_INIT_OUT" | tail -n 8
fi

echo "==> install + start tollbooth"
npm -C services/tollbooth i >/dev/null
PORT="$TOLLBOOTH_PORT" \
SOLANA_RPC_URL="$RPC_URL" \
TOLLBOOTH_KEYPAIR="$WALLET_PATH" \
npm -C services/tollbooth run dev >"$LOG_DIR/tollbooth.log" 2>&1 &
TOLLBOOTH_PID=$!

if ! wait_http "http://127.0.0.1:${TOLLBOOTH_PORT}/v1/challenge?wallet=${WALLET_PUBKEY}" 45; then
  echo "tollbooth_start_failed: see $LOG_DIR/tollbooth.log"
  exit 1
fi

echo "==> install + start gateway"
npm -C gateway i >/dev/null
npm -C gateway run build >/dev/null
PORT="$GATEWAY_PORT" \
SOLANA_RPC_URL="$RPC_URL" \
npm -C gateway run start >"$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!

if ! wait_http "http://127.0.0.1:${GATEWAY_PORT}/healthz" 60; then
  echo "gateway_start_failed: see $LOG_DIR/gateway.log"
  exit 1
fi

echo "==> set .dns route via tollbooth devnet flow"
set +e
FLOW_OUT="$(
  TOLLBOOTH_URL="http://127.0.0.1:${TOLLBOOTH_PORT}" \
  CLIENT_WALLET="$CLIENT_WALLET_PATH" \
  LABEL="$DEMO_LABEL" \
  NAME="$DEMO_NAME" \
  DEST="$DEMO_DEST" \
  TTL="$DEMO_TTL" \
  npm -C services/tollbooth run flow:devnet 2>&1
)"
FLOW_CMD_RC=$?
set -e
echo "$FLOW_OUT" | tail -n 30

CLAIM_TX="$(extract_tx "$(echo "$FLOW_OUT" | rg "claim_passport:" -A3 || true)")"
ASSIGN_TX="$(extract_tx "$(echo "$FLOW_OUT" | rg "assign_route:" -A3 || true)")"
FLOW_OK=1
if [[ $FLOW_CMD_RC -ne 0 ]] || ! echo "$FLOW_OUT" | rg -q "assign_route:\s+200"; then
  FLOW_OK=0
  echo "warning: tollbooth devnet flow did not return assign_route 200; continuing for audit visibility"
fi

echo "==> resolve ICANN via gateway"
ICANN_JSON="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/v1/resolve?name=netflix.com&type=A")"
echo "$ICANN_JSON" >"$LOG_DIR/gateway_icann.json"
echo "$ICANN_JSON" | head -c 300; echo

echo "==> resolve .dns via gateway (best-effort, canonical route dependent)"
set +e
DNS_JSON="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/v1/resolve?name=${DEMO_NAME}&type=A" 2>/dev/null)"
DNS_RC=$?
set -e
if [[ $DNS_RC -eq 0 ]]; then
  echo "$DNS_JSON" >"$LOG_DIR/gateway_dns.json"
  echo "$DNS_JSON" | head -c 300; echo
else
  echo "gateway_dns_resolve_unavailable_for_${DEMO_NAME}; falling back to tollbooth resolver proof"
fi

echo "==> resolve .dns via tollbooth (route proof)"
set +e
TOLL_JSON="$(curl -sS "http://127.0.0.1:${TOLLBOOTH_PORT}/v1/resolve?wallet=${CLIENT_WALLET_PUBKEY}&name=${DEMO_NAME}")"
TOLL_RC=$?
set -e
if [[ $TOLL_RC -eq 0 ]]; then
  echo "$TOLL_JSON" >"$LOG_DIR/tollbooth_dns.json"
  echo "$TOLL_JSON" | head -c 300; echo
else
  echo "warning: tollbooth resolve call failed for ${DEMO_NAME}"
fi

if [[ "$ENABLE_WITNESS_REWARDS" == "1" ]]; then
  echo "==> optional witness rewards path enabled"
  echo "manual_next: npm -C solana run witness-rewards -- --rpc \"$RPC_URL\" --wallet \"$WALLET_PATH\" status"
else
  echo "==> optional witness reward submit/claim skipped (ENABLE_WITNESS_REWARDS=1 to enable)"
fi

echo "==> tx links"
if [[ -n "$CLAIM_TX" ]]; then
  echo "claim_passport_tx: https://explorer.solana.com/tx/${CLAIM_TX}?cluster=devnet"
fi
if [[ -n "$ASSIGN_TX" ]]; then
  echo "assign_route_tx: https://explorer.solana.com/tx/${ASSIGN_TX}?cluster=devnet"
fi
if [[ $FLOW_OK -eq 0 ]]; then
  echo "blocker: tollbooth flow returned non-200; inspect $LOG_DIR/tollbooth.log and flow output above"
fi

echo "logs_dir: $LOG_DIR"
echo "✅ demo complete"
