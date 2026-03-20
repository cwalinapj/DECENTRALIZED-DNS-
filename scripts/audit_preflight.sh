#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> audit preflight: production baseline"
npm run prod:baseline:check

echo "==> audit preflight: signed release manifests"
npm run prod:release:verify

echo "==> audit preflight: anchor program invariants"
bash scripts/check_program_invariants.sh

echo "audit_preflight: PASS"
