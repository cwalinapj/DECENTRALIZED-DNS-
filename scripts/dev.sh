#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/gateway"

npm install
npm run build
NODE_ENV=development HOST="${HOST:-0.0.0.0}" PORT="${PORT:-8054}" npm start
