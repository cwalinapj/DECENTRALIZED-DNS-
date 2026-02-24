#!/usr/bin/env bash
set -euo pipefail

ZONE="${1:-tahoecarspa.com}"
NS1="${NS1_HOST:-ns1.tolldns.io}"
NS2="${NS2_HOST:-ns2.tolldns.io}"
APEX_A="${APEX_A:-198.51.100.42}"

if ! command -v pdnsutil >/dev/null 2>&1; then
  echo "error: pdnsutil is required" >&2
  exit 2
fi

if ! pdnsutil list-zone "$ZONE" >/dev/null 2>&1; then
  pdnsutil create-zone "$ZONE" "$NS1"
fi

pdnsutil add-record "$ZONE" @ NS "$NS2"
pdnsutil add-record "$ZONE" @ A "$APEX_A"
pdnsutil add-record "$ZONE" www CNAME "$ZONE"
pdnsutil add-record "$ZONE" ns1 A "$APEX_A"
pdnsutil add-record "$ZONE" ns2 A "$APEX_A"
pdnsutil rectify-zone "$ZONE"

echo "ok: bootstrapped zone ${ZONE}"
