#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/root1/dev/web3-repos/DECENTRALIZED-DNS-"

cd "$ROOT/resolver"

npm install
npm run build
PORT=8054 npm start
