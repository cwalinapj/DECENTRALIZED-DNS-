#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/resolver"

npm install
npm run build
NODE_ENV=development PORT="${PORT:-8054}" npm start
