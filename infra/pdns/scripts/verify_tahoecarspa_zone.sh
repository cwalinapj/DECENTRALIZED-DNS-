#!/usr/bin/env bash
set -euo pipefail

ZONE="${1:-tahoecarspa.com}"
NS1="${NS1_HOST:-ns1.tolldns.io}"
NS2="${NS2_HOST:-ns2.tolldns.io}"

if ! command -v pdnsutil >/dev/null 2>&1; then
  echo "error: pdnsutil is required" >&2
  exit 2
fi

zone_dump="$(pdnsutil list-zone "$ZONE")"
echo "$zone_dump"

echo "$zone_dump" | grep -F "$NS1" >/dev/null
echo "$zone_dump" | grep -F "$NS2" >/dev/null

echo "ok: verified NS records for ${ZONE}"
