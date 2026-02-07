# resolver

## PURPOSE
The resolver provides the DoH service for DNS requests, validates vouchers/session tokens, and produces per-request receipts. It is the main runtime entrypoint for paid DNS resolution and settlement data generation.

## INVENTORY
- Entry: `resolver/src/server.ts`
- CLI: `resolver/src/voucher-cli.ts`, `receipt-batch.ts`, `receipt-verify.ts`, `merkle-proof.ts`, `merkle-verify.ts`
- Config: `resolver/package.json`, `resolver/tsconfig.json`
- Tests: `resolver/tests/*.test.ts`
- Dependencies: `express`, `dns-packet`, `@noble/*`, `ethers`

## RUNNABILITY CHECK
**Happy path:**
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/resolver
npm install
npm run build
npm test
PORT=8054 VOUCHER_PUBKEY_HEX=... /Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```
**Result:** build + tests pass locally. Resolver starts on `:8054`.

## INTERFACE CONTRACT
Inputs:
- HTTP DoH: `POST /dns-query` (dns-message) or `GET /dns-query?name=...`.
- Headers: `x-ddns-voucher` (JSON) or `x-ddns-session`.

Outputs:
- DoH response bytes, or JSON with `receipt` when `?json=1`.

Adapter response/error shape: see `docs/sections/ADAPTER_INTERFACE.md`.

## SECURITY + RELIABILITY PASS
- Voucher validation enforces nonce replay + max age.
- Added upstream fetch timeout (2s) and standardized error codes.
- No secrets committed; all keys are env-based.

## TESTS
- `resolver/tests/voucher-types.test.ts`
- `resolver/tests/escrow-reporter.test.ts`

## DOCS
- `resolver/README.md` updated with tests + escrow integration.

## STATUS
- **Status:** working
- **Commands tried:** `npm run build`, `npm test`
- **Failures:** none

## TODO (priority)
1. Wire batch settlement aggregation into escrow (server-side batching endpoint).
2. Add auth to settlement submission.
