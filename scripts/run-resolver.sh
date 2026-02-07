#!/usr/bin/env bash
set -euo pipefail

cd /Users/root1/scripts/DECENTRALIZED-DNS-/resolver
npm install
npm run build

PORT=${PORT:-8054} \
UPSTREAM_DOH_URL=${UPSTREAM_DOH_URL:-https://cloudflare-dns.com/dns-query} \
RECEIPT_DIR=${RECEIPT_DIR:-./receipts} \
ALLOW_UNAUTHENTICATED=${ALLOW_UNAUTHENTICATED:-1} \
VOUCHER_PUBKEY_HEX=${VOUCHER_PUBKEY_HEX:-} \
node dist/server.js
