#!/usr/bin/env bash
set -euo pipefail

ZONE="tahoecarspa.com"
NS1_IP="45.131.65.193"
NS2_IP="23.95.25.194"

sudo pdnsutil create-zone "$ZONE" "ns1.$ZONE" || true

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
SERIAL="$(date -u +%Y%m%d%H)"
sudo pdnsutil replace-rrset "$ZONE" @ SOA 3600 "ns1.$ZONE hostmaster.$ZONE ${SERIAL} 10800 3600 604800 3600"

sudo pdnsutil check-zone "$ZONE"
dig @127.0.0.1 "$ZONE" NS +norec +short
dig @127.0.0.1 ns2."$ZONE" A +norec +short
