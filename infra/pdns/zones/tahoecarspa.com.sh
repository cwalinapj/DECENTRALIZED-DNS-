#!/usr/bin/env bash
set -euo pipefail

ZONE="tahoecarspa.com"
NS1_IP="45.131.65.193"
NS2_IP="23.95.25.194"

if ! CREATE_OUT="$(sudo pdnsutil create-zone "$ZONE" "ns1.$ZONE" 2>&1)"; then
  if [[ "$CREATE_OUT" != *"already exists"* ]]; then
    echo "$CREATE_OUT" >&2
    exit 1
  fi
fi

# NS records
sudo pdnsutil replace-rrset "$ZONE" @ NS 3600 "ns1.$ZONE" "ns2.$ZONE"

# Glue
sudo pdnsutil replace-rrset "$ZONE" ns1 A 3600 "$NS1_IP"
sudo pdnsutil replace-rrset "$ZONE" ns2 A 3600 "$NS2_IP"

# A records you mentioned
sudo pdnsutil replace-rrset "$ZONE" @   A 3600 "$NS1_IP"
sudo pdnsutil replace-rrset "$ZONE" www A 3600 "$NS1_IP"
sudo pdnsutil replace-rrset "$ZONE" api A 3600 "$NS1_IP"
sudo pdnsutil replace-rrset "$ZONE" dns A 3600 "$NS1_IP"

# SOA (single quoted content string)
SERIAL="$(date -u +%Y%m%d%H%M%S)"
sudo pdnsutil replace-rrset "$ZONE" @ SOA 3600 "ns1.$ZONE hostmaster.$ZONE ${SERIAL} 10800 3600 604800 3600"

sudo pdnsutil check-zone "$ZONE"
NS_RESULTS="$(dig @127.0.0.1 "$ZONE" NS +norec +short)"
echo "$NS_RESULTS" | grep -Fx "ns1.$ZONE." || { echo "ERROR: ns1.$ZONE NS record not found" >&2; exit 1; }
echo "$NS_RESULTS" | grep -Fx "ns2.$ZONE." || { echo "ERROR: ns2.$ZONE NS record not found" >&2; exit 1; }
dig @127.0.0.1 ns1."$ZONE" A +norec +short | grep -Fx "$NS1_IP" || { echo "ERROR: ns1.$ZONE A record not found" >&2; exit 1; }
dig @127.0.0.1 ns2."$ZONE" A +norec +short | grep -Fx "$NS2_IP" || { echo "ERROR: ns2.$ZONE A record not found" >&2; exit 1; }
echo "Zone $ZONE provisioned and validated successfully."
