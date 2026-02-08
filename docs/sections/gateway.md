# gateway

## PURPOSE
The gateway provides the `/resolve` HTTP API for DNS and Web3 naming requests, applies caching/timeouts, and validates vouchers/session tokens when enabled. It is the main runtime entrypoint for paid DNS resolution and settlement data generation.

## INVENTORY
- Entry: `gateway/src/server.ts`
- CLI: `gateway/src/voucher-cli.ts`, `receipt-batch.ts`, `receipt-verify.ts`, `merkle-proof.ts`, `merkle-verify.ts`
- Config: `gateway/package.json`, `gateway/tsconfig.json`
- Tests: `gateway/tests/*.test.ts`
- Dependencies: `express`, `dns-packet`, `@noble/*`, `ethers`

## RUNNABILITY CHECK
**Happy path:**
```bash
cd /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/gateway
npm install
npm run build
npm test
PORT=8054 VOUCHER_PUBKEY_HEX=... /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```
**Result:** build + tests pass locally. Gateway starts on `:8054`.

## INTERFACE CONTRACT
Inputs:
- HTTP API: `GET /resolve?name=...`.
- Headers: `x-ddns-voucher` (JSON) or `x-ddns-session` (optional).

Outputs:
- JSON: `{ name, network, records, metadata }` plus optional `receipt` when configured.

Adapter response/error shape: see `docs/sections/ADAPTER_INTERFACE.md`.

## SECURITY + RELIABILITY PASS
- Voucher validation enforces nonce replay + max age.
- Added upstream fetch timeout (2s) and standardized error codes.
- No secrets committed; all keys are env-based.

## TESTS
- `gateway/tests/resolve.test.ts`
- `gateway/tests/registry.test.ts`

## DOCS
- `gateway/README.md` updated with tests + escrow integration.

## STATUS
- **Status:** working
- **Commands tried:** `npm run build`, `npm test`
- **Failures:** none

## TODO (priority)
1. Wire batch settlement aggregation into escrow (server-side batching endpoint).
2. Add auth to settlement submission.
