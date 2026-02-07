# escrow

## PURPOSE
Escrow manages Index Unit balances and voucher-based spend authorization so the resolver can charge usage without per-request wallet prompts. It backs toll settlement and provides a batch-friendly ledger interface for usage debits.

## INVENTORY
- `escrow/README.md` – module overview + run/test.
- `escrow/package.json`, `escrow/tsconfig.json` – TypeScript build.
- `escrow/src/escrow.ts` – in-memory escrow.
- `escrow/src/vouchers.ts` – HMAC voucher verifier (demo).
- `escrow/src/server.ts` – HTTP demo API.
- `escrow/contracts/SpendEscrow.sol`, `escrow/contracts/VoucherVerifier.sol` – Solidity stubs.
- `escrow/tests/escrow.test.ts` – vitest.
- Build tools: `typescript`, `vitest`.

## RUNNABILITY CHECK
**Happy path:**
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/escrow
npm install
npm run build
npx vitest run
PORT=8796 VOUCHER_HMAC_SECRET=dev-secret npm start
```
**Result:** Build + tests pass locally. Demo server starts on `:8796`.

## INTERFACE CONTRACT
**HTTP demo API**
- `POST /v1/deposit` `{ user, amount }` → `{ ok, balance }`
- `POST /v1/withdraw` `{ user, amount }` → `{ ok, balance }`
- `POST /v1/settle` `{ settler, user, amount, settlement_id }` → `{ ok, record }`
- `POST /v1/voucher/verify` `{ payload, signature }` → `{ ok, reason? }`

**Voucher format (demo):**
```json
{ "payload": { "user": "...", "nonce": "1", "scope": { "max_amount": "100", "exp": 123 } }, "signature": "<hmac>" }
```

## SECURITY + RELIABILITY PASS
- Demo verifier uses HMAC (not production ECDSA). Documented in README.
- No network calls; no timeouts needed.
- No secrets committed.

## TESTS
- `escrow/tests/escrow.test.ts` (vitest). Run via `npx vitest run`.

## DOCS
- `escrow/README.md` updated with usage and limits.
- `escrow/contracts/README.md` documents on-chain stubs.

## STATUS
- **Status:** partial (demo-ready, on-chain verification stubbed)
- **Commands tried:** `npm run build`, `npx vitest run`
- **Failures:** none

## TODO (priority)
1. Replace HMAC with ECDSA verification for vouchers.
2. Wire Solidity escrow to ERC-20 transfers and access control.
3. Add batch settlement aggregation endpoint.
