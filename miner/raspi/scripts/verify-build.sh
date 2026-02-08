#!/usr/bin/env bash
set -euo pipefail

# Verifies docker images against on-chain approved build hashes.
# Requires:
# - EVM_RPC_URL
# - BUILD_REGISTRY_CONTRACT
#
# Run from miner/raspi/

RASPI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEC_DIR="${RASPI_DIR}/../../security/release-integrity"

cd "${RASPI_DIR}"

if [[ ! -f ".env" ]]; then
  echo "ERROR: .env missing in ${RASPI_DIR}"
  exit 1
fi

# Load env
set -a
# shellcheck disable=SC1091
source "${RASPI_DIR}/.env"
set +a

if [[ -z "${EVM_RPC_URL:-}" ]]; then
  echo "ERROR: EVM_RPC_URL not set"
  exit 1
fi

if [[ -z "${BUILD_REGISTRY_CONTRACT:-}" ]]; then
  echo "ERROR: BUILD_REGISTRY_CONTRACT not set"
  exit 1
fi

echo "Verifying stack images against chain..."
echo "  EVM_RPC_URL=${EVM_RPC_URL}"
echo "  BUILD_REGISTRY_CONTRACT=${BUILD_REGISTRY_CONTRACT}"

# Build the verifier (if not already)
pushd "${SEC_DIR}" >/dev/null
npm install >/dev/null 2>&1 || true
npm run build >/dev/null
popd >/dev/null

# Run verification (requires docker access)
node "${SEC_DIR}/dist/cli_verify_stack.js"
echo "OK: build integrity verified"
