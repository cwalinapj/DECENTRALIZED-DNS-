#!/usr/bin/env bash
set -euo pipefail

RESOLVER_URL=${1:-"http://localhost:8787"}
QUERY_NAME=${2:-"example.com"}
QUERY_TYPE=${3:-"A"}
VOUCHER_JSON=${4:-"{}"}

curl -sS -X POST "$RESOLVER_URL/v1/resolve" \
  -H "Content-Type: application/json" \
  -d "{\"voucher\": $VOUCHER_JSON, \"query\": {\"name\": \"$QUERY_NAME\", \"type\": \"$QUERY_TYPE\", \"needsGateway\": true}}"
