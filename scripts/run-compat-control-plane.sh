#!/usr/bin/env bash
set -euo pipefail

cd /Users/root1/scripts/DECENTRALIZED-DNS-/compat-control-plane

npm install
npm run build

PORT=${PORT:-8788} DATA_DIR=${DATA_DIR:-./data} npm start
