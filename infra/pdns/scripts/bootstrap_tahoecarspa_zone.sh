#!/usr/bin/env bash
set -euo pipefail

ZONE="${1:-tahoecarspa.com}"
NS1="${NS1_HOST:-ns1.tolldns.io}"
NS2="${NS2_HOST:-ns2.tolldns.io}"
# Defaults use documentation-range IPs; replace for your environment.
APEX_A="${APEX_A:-198.51.100.42}"
NS1_FQDN="${NS1%.}."
NS2_FQDN="${NS2%.}."

if ! command -v pdnsutil >/dev/null 2>&1; then
  echo "error: pdnsutil is required" >&2
  exit 2
fi

if ! pdnsutil list-zone "$ZONE" >/dev/null 2>&1; then
  pdnsutil create-zone "$ZONE" "$NS1_FQDN"
fi

pdnsutil replace-rrset "$ZONE" @ NS 3600 "$NS1_FQDN" "$NS2_FQDN"
pdnsutil replace-rrset "$ZONE" @ A 3600 "$APEX_A"
pdnsutil replace-rrset "$ZONE" www CNAME 3600 "${ZONE}."
pdnsutil rectify-zone "$ZONE"

echo "ok: bootstrapped zone ${ZONE}"
