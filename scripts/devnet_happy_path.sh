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
ALLOW_LOCAL_FALLBACK="${ALLOW_LOCAL_FALLBACK:-0}"
DEMO_JSON="${DEMO_JSON:-0}"
DDNS_SKIP_DEPLOY_VERIFY="${DDNS_SKIP_DEPLOY_VERIFY:-0}"
DEFAULT_DDNS_PROGRAM_ID_PRIMARY="EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5"

LOG_DIR="${TMPDIR:-/tmp}/ddns-devnet-demo"
mkdir -p "$LOG_DIR"

JSON_EMITTED=0
DEMO_ERROR=""
VERIFY_STATUS="unknown"
CLAIM_STATUS="not_claimed"
EFFECTIVE_NAME=""
FLOW_OK=0
TOLL_OK=0
WALLET_PUBKEY=""
SELECTED_DDNS_PROGRAM_ID=""
CLAIM_TX=""
ASSIGN_TX=""
ROUTE_PROOF_SIG=""
DEST_OUT=""
CONFIDENCE_OUT=""
RRSET_HASH_OUT=""
TTL_OUT=""

if [[ "$DEMO_JSON" == "1" ]] && ! command -v jq >/dev/null 2>&1; then
  echo "error: DEMO_JSON=1 requires jq" >&2
  exit 2
fi

get_anchor_program_id() {
  local key="$1"
  awk -v k="$key" '
    $0 ~ /^\[programs\.devnet\]/ { in_devnet=1; next }
    $0 ~ /^\[/ && $0 !~ /^\[programs\.devnet\]/ { in_devnet=0 }
    in_devnet && $1 == k { gsub(/"/, "", $3); print $3; exit }
  ' solana/Anchor.toml 2>/dev/null || true
}

emit_demo_json() {
  local ok_bool="$1"
  local err_msg="${2:-}"
  local timestamp_utc
  local tx_links_json program_ids_json names_program_id

  if [[ "$DEMO_JSON" != "1" ]]; then
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "error: DEMO_JSON=1 requires jq" >&2
    return 0
  fi

  names_program_id="$(get_anchor_program_id ddns_names)"
  tx_links_json="$(
    {
      [[ -n "$CLAIM_TX" ]] && printf '%s\n' "https://explorer.solana.com/tx/${CLAIM_TX}?cluster=devnet"
      [[ -n "$ASSIGN_TX" ]] && printf '%s\n' "https://explorer.solana.com/tx/${ASSIGN_TX}?cluster=devnet"
      if [[ -n "$ROUTE_PROOF_SIG" && "$ROUTE_PROOF_SIG" != "$ASSIGN_TX" && "$ROUTE_PROOF_SIG" != "$CLAIM_TX" ]]; then
        printf '%s\n' "https://explorer.solana.com/tx/${ROUTE_PROOF_SIG}?cluster=devnet"
      fi
    } | jq -Rsc 'split("\n") | map(select(length>0))'
  )"

  program_ids_json="$(
    jq -cn \
      --arg ddns_anchor "${SELECTED_DDNS_PROGRAM_ID:-}" \
      --arg ddns_names "${names_program_id:-}" \
      '{ddns_anchor:$ddns_anchor, ddns_names:$ddns_names}'
  )"
  timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  jq -cn \
    --argjson ok "$ok_bool" \
    --arg name "${EFFECTIVE_NAME:-}" \
    --arg dest "${DEST_OUT:-}" \
    --arg confidence "${CONFIDENCE_OUT:-}" \
    --arg rrset_hash "${RRSET_HASH_OUT:-}" \
    --arg wallet_pubkey "${WALLET_PUBKEY:-}" \
    --arg timestamp_utc "$timestamp_utc" \
    --arg error "$err_msg" \
    --argjson tx_links "$tx_links_json" \
    --argjson program_ids "$program_ids_json" \
    '{
      ok: $ok,
      name: (if $name == "" then null else $name end),
      dest: (if $dest == "" then null else $dest end),
      confidence: (if $confidence == "" then null else $confidence end),
      rrset_hash: (if $rrset_hash == "" then null else $rrset_hash end),
      tx_links: $tx_links,
      program_ids: $program_ids,
      wallet_pubkey: $wallet_pubkey,
      timestamp_utc: $timestamp_utc
    } + (if $error == "" then {} else {error:$error} end)'

  JSON_EMITTED=1
}

cleanup() {
  set +e
  if [[ -n "${GATEWAY_PID:-}" ]]; then kill "$GATEWAY_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${TOLLBOOTH_PID:-}" ]]; then kill "$TOLLBOOTH_PID" >/dev/null 2>&1 || true; fi
}
on_exit() {
  local status=$?
  cleanup
  if [[ "$DEMO_JSON" == "1" && "$status" -ne 0 && "$JSON_EMITTED" -eq 0 ]]; then
    emit_demo_json false "${DEMO_ERROR:-demo_failed}"
  fi
  exit "$status"
}
trap on_exit EXIT

if [[ ! -f "$WALLET_PATH" ]]; then
  DEMO_ERROR="wallet_not_found"
  echo "wallet_not_found: $WALLET_PATH"
  exit 1
fi

if [[ -z "$CLIENT_WALLET_PATH" ]]; then
  # Default demo client to authority wallet for legacy signer-constrained deployments.
  CLIENT_WALLET_PATH="$WALLET_PATH"
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

start_tollbooth() {
  local program_id="$1"
  if [[ -n "${TOLLBOOTH_PID:-}" ]]; then
    kill "$TOLLBOOTH_PID" >/dev/null 2>&1 || true
    TOLLBOOTH_PID=""
    sleep 1
  fi
  PORT="$TOLLBOOTH_PORT" \
  SOLANA_RPC_URL="$RPC_URL" \
  TOLLBOOTH_KEYPAIR="$WALLET_PATH" \
  DDNS_PROGRAM_ID="$program_id" \
  ALLOW_LOCAL_FALLBACK="$ALLOW_LOCAL_FALLBACK" \
  npm -C services/tollbooth run dev >"$LOG_DIR/tollbooth.log" 2>&1 &
  TOLLBOOTH_PID=$!
  if ! wait_http "http://127.0.0.1:${TOLLBOOTH_PORT}/v1/challenge?wallet=${WALLET_PUBKEY}" 45; then
    echo "tollbooth_start_failed: see $LOG_DIR/tollbooth.log"
    return 1
  fi
  return 0
}

extract_tx() {
  local blob="$1"
  printf "%s\n" "$blob" | rg -o "tx: '[^']+'" | sed -E "s/tx: '([^']+)'/\1/" | head -n 1 || true
}

if [[ "$DDNS_SKIP_DEPLOY_VERIFY" == "1" ]]; then
  echo "==> verify deployed MVP programs on devnet (skipped: DDNS_SKIP_DEPLOY_VERIFY=1)"
  VERIFY_STATUS="skipped"
else
  echo "==> verify deployed MVP programs on devnet"
  npm -C solana run devnet:verify
  VERIFY_STATUS="verified"
fi

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
if [[ "$ALLOW_LOCAL_FALLBACK" == "1" ]]; then
  echo "##############################"
  echo "### DEMO MODE: LOCAL FALLBACK"
  echo "### ALLOW_LOCAL_FALLBACK=1"
  echo "##############################"
fi

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

echo "==> ensure anchor IDL for tollbooth (ddns_anchor)"
if [[ ! -f "solana/target/idl/ddns_anchor.json" ]]; then
  cd solana
  anchor build --program-name ddns_anchor >"$LOG_DIR/anchor_build.log" 2>&1 || {
    echo "anchor_build_failed: see $LOG_DIR/anchor_build.log"
    exit 1
  }
  cd "$ROOT_DIR"
fi

echo "==> install tollbooth"
npm -C services/tollbooth i >/dev/null

echo "==> set .dns route via tollbooth devnet flow"
if [[ -n "${DDNS_PROGRAM_ID:-}" ]]; then
  PROGRAM_CANDIDATES=("$DDNS_PROGRAM_ID")
else
  PROGRAM_CANDIDATES=("$DEFAULT_DDNS_PROGRAM_ID_PRIMARY")
fi
FLOW_CMD_RC=1
FLOW_OUT=""
SELECTED_DDNS_PROGRAM_ID=""
for CANDIDATE in "${PROGRAM_CANDIDATES[@]}"; do
  echo "==> start tollbooth with ddns_program_id=$CANDIDATE"
  if ! start_tollbooth "$CANDIDATE"; then
    continue
  fi
  set +e
  CANDIDATE_FLOW_OUT="$(
    TOLLBOOTH_URL="http://127.0.0.1:${TOLLBOOTH_PORT}" \
    CLIENT_WALLET="$CLIENT_WALLET_PATH" \
    LABEL="$DEMO_LABEL" \
    NAME="$DEMO_NAME" \
    DEST="$DEMO_DEST" \
    TTL="$DEMO_TTL" \
    npm -C services/tollbooth run flow:devnet 2>&1
  )"
  CANDIDATE_FLOW_RC=$?
  set -e

  FLOW_OUT="$CANDIDATE_FLOW_OUT"
  FLOW_CMD_RC=$CANDIDATE_FLOW_RC
  SELECTED_DDNS_PROGRAM_ID="$CANDIDATE"
  if [[ $FLOW_CMD_RC -eq 0 ]] && echo "$FLOW_OUT" | rg -q "assign_route:\\s+200"; then
    break
  fi
  if echo "$FLOW_OUT" | rg -q "DeclaredProgramIdMismatch"; then
    echo "declared_program_id_mismatch_on_$CANDIDATE; trying next candidate"
    continue
  fi
  break
done

echo "selected_ddns_program_id: ${SELECTED_DDNS_PROGRAM_ID:-unknown}"
echo "$FLOW_OUT" | tail -n 30

CLAIM_TX="$(extract_tx "$(echo "$FLOW_OUT" | rg "claim_passport:" -A3 || true)")"
ASSIGN_TX="$(extract_tx "$(echo "$FLOW_OUT" | rg "assign_route(_retry)?: " -A4 || true)")"
ROUTE_RECORD_PDA="$(echo "$FLOW_OUT" | sed -n "s/.*route_record_pda: '\([^']\+\)'.*/\1/p" | tail -n1)"
NAME_RECORD_PDA="$(echo "$FLOW_OUT" | sed -n "s/.*name_record_pda: '\([^']\+\)'.*/\1/p" | tail -n1)"
if echo "$FLOW_OUT" | rg -q "claim_passport:\s+200"; then
  CLAIM_STATUS="claimed_or_exists"
else
  CLAIM_STATUS="not_claimed"
fi
EFFECTIVE_NAME="$(echo "$FLOW_OUT" | sed -n 's/^resolved_name:[[:space:]]*//p' | tail -n 1)"
if [[ -z "$EFFECTIVE_NAME" ]]; then
  EFFECTIVE_NAME="$DEMO_NAME"
fi
FLOW_OK=1
if [[ $FLOW_CMD_RC -ne 0 ]] || ! echo "$FLOW_OUT" | rg -q "assign_route:\\s+200"; then
  FLOW_OK=0
  echo "warning: tollbooth devnet flow did not return assign_route 200; continuing for audit visibility"
fi
if [[ $FLOW_OK -eq 1 ]] && echo "$FLOW_OUT" | rg -q "mode:[[:space:]]*'local_fallback'"; then
  if [[ "$ALLOW_LOCAL_FALLBACK" != "1" ]]; then
    FLOW_OK=0
    echo "strict_mode_blocked: local_fallback detected but ALLOW_LOCAL_FALLBACK!=1"
  else
    echo "##############################"
    echo "### DEMO MODE: LOCAL FALLBACK"
    echo "### ALLOW_LOCAL_FALLBACK=1"
    echo "##############################"
  fi
fi

echo "==> install + start gateway"
npm -C gateway i >/dev/null
npm -C gateway run build >/dev/null
PORT="$GATEWAY_PORT" \
SOLANA_RPC_URL="$RPC_URL" \
npm -C gateway run start >"$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!

if ! wait_http "http://127.0.0.1:${GATEWAY_PORT}/healthz" 60; then
  DEMO_ERROR="gateway_start_failed"
  echo "gateway_start_failed: see $LOG_DIR/gateway.log"
  exit 1
fi

echo "==> resolve ICANN via gateway"
ICANN_JSON="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/v1/resolve?name=netflix.com&type=A")"
echo "$ICANN_JSON" >"$LOG_DIR/gateway_icann.json"
echo "$ICANN_JSON" | head -c 300; echo

echo "==> resolve .dns via gateway (best-effort, canonical route dependent)"
set +e
DNS_JSON="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/v1/resolve?name=${EFFECTIVE_NAME}&type=A" 2>/dev/null)"
DNS_RC=$?
set -e
if [[ $DNS_RC -eq 0 ]]; then
  echo "$DNS_JSON" >"$LOG_DIR/gateway_dns.json"
  echo "$DNS_JSON" | head -c 300; echo
else
  echo "gateway_dns_resolve_unavailable_for_${EFFECTIVE_NAME}; falling back to tollbooth resolver proof"
fi

echo "==> resolve .dns via tollbooth (route proof)"
set +e
TOLL_JSON="$(curl -sS "http://127.0.0.1:${TOLLBOOTH_PORT}/v1/resolve?wallet=${CLIENT_WALLET_PUBKEY}&name=${EFFECTIVE_NAME}")"
TOLL_RC=$?
set -e
if [[ $TOLL_RC -eq 0 ]]; then
  echo "$TOLL_JSON" >"$LOG_DIR/tollbooth_dns.json"
  echo "$TOLL_JSON" | head -c 300; echo
else
  echo "warning: tollbooth resolve call failed for ${EFFECTIVE_NAME}"
fi

TOLL_OK=0
if [[ $TOLL_RC -eq 0 ]] && echo "$TOLL_JSON" | rg -q '"ok"\s*:\s*true'; then
  TOLL_OK=1
fi
if [[ $TOLL_OK -eq 1 ]] && echo "$TOLL_JSON" | rg -q '"mode"\s*:\s*"local_fallback"'; then
  if [[ "$ALLOW_LOCAL_FALLBACK" != "1" ]]; then
    TOLL_OK=0
    DEMO_ERROR="strict_mode_blocked_local_fallback"
    echo "strict_mode_blocked: resolve proof mode=local_fallback but ALLOW_LOCAL_FALLBACK!=1"
  fi
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
ROUTE_PROOF_SIG=""
if command -v jq >/dev/null 2>&1 && [[ $TOLL_RC -eq 0 ]] && jq -e . >/dev/null 2>&1 <<<"$TOLL_JSON"; then
  ROUTE_PROOF_SIG="$(jq -r '.proof.signature // empty' <<<"$TOLL_JSON")"
  if [[ -n "$ROUTE_PROOF_SIG" && "$ROUTE_PROOF_SIG" != "$ASSIGN_TX" && "$ROUTE_PROOF_SIG" != "$CLAIM_TX" ]]; then
    echo "resolve_proof_tx: https://explorer.solana.com/tx/${ROUTE_PROOF_SIG}?cluster=devnet"
  fi
fi
if [[ -n "${SELECTED_DDNS_PROGRAM_ID:-}" ]]; then
  echo "ddns_program_id_used: ${SELECTED_DDNS_PROGRAM_ID}"
fi
if [[ $FLOW_OK -eq 0 ]]; then
  DEMO_ERROR="route_not_written"
  echo "blocker: tollbooth flow returned non-200; inspect $LOG_DIR/tollbooth.log and flow output above"
fi

echo "logs_dir: $LOG_DIR"
echo
echo "========== DEMO SUMMARY =========="
echo "deploy_verify: ${VERIFY_STATUS:-unknown}"
echo "name_claimed: $CLAIM_STATUS"
echo "name: ${EFFECTIVE_NAME}"
echo "route_written: $([[ $FLOW_OK -eq 1 ]] && echo "yes" || echo "no")"
if [[ -n "$NAME_RECORD_PDA" ]]; then
  echo "name_record_pda: $NAME_RECORD_PDA"
fi
if [[ -n "$ROUTE_RECORD_PDA" ]]; then
  echo "route_record_pda: $ROUTE_RECORD_PDA"
fi
echo "resolve_result: $([[ $TOLL_OK -eq 1 ]] && echo "ok" || echo "failed")"
if [[ $TOLL_OK -eq 1 ]]; then
  if command -v jq >/dev/null 2>&1 && jq -e . >/dev/null 2>&1 <<<"$TOLL_JSON"; then
    DEST_OUT="$(jq -r '.dest // empty' <<<"$TOLL_JSON")"
    TTL_OUT="$(jq -r '.ttl // empty' <<<"$TOLL_JSON")"
    CONFIDENCE_OUT="$(jq -r '.confidence // empty' <<<"$TOLL_JSON")"
    RRSET_HASH_OUT="$(jq -r '.rrset_hash // .dest_hash_hex // empty' <<<"$TOLL_JSON")"
    echo "resolved_dest: ${DEST_OUT:--}"
    echo "resolved_ttl: ${TTL_OUT:--}"
  fi
fi
if [[ -z "$DEST_OUT" && $DNS_RC -eq 0 ]] && command -v jq >/dev/null 2>&1 && jq -e . >/dev/null 2>&1 <<<"$DNS_JSON"; then
  DEST_OUT="$(jq -r '.dest // empty' <<<"$DNS_JSON")"
  TTL_OUT="$(jq -r '.ttl_s // .ttl // empty' <<<"$DNS_JSON")"
  CONFIDENCE_OUT="$(jq -r '.confidence // empty' <<<"$DNS_JSON")"
  RRSET_HASH_OUT="$(jq -r '.rrset_hash // empty' <<<"$DNS_JSON")"
fi
echo "tx_links:"
if [[ -n "$CLAIM_TX" ]]; then
  echo "- https://explorer.solana.com/tx/${CLAIM_TX}?cluster=devnet"
fi
if [[ -n "$ASSIGN_TX" ]]; then
  echo "- https://explorer.solana.com/tx/${ASSIGN_TX}?cluster=devnet"
fi
if [[ -n "$ROUTE_PROOF_SIG" && "$ROUTE_PROOF_SIG" != "$ASSIGN_TX" && "$ROUTE_PROOF_SIG" != "$CLAIM_TX" ]]; then
  echo "- https://explorer.solana.com/tx/${ROUTE_PROOF_SIG}?cluster=devnet"
fi
echo "=================================="
if [[ $FLOW_OK -eq 1 && $TOLL_OK -eq 1 ]]; then
  echo "✅ demo complete"
  emit_demo_json true ""
else
  DEMO_ERROR="${DEMO_ERROR:-dns_route_or_resolve_failed}"
  echo "❌ demo failed (.dns route+resolve did not succeed)"
  exit 1
fi
