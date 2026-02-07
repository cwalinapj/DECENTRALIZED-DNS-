# Escrow (Index Units)

This module defines the escrow contracts + reference logic for **Index Units**,
which are used to pay TollDNS usage without requiring per-request approvals.

## Layout
- `contracts/` – Solidity stubs (SpendEscrow, VoucherVerifier)
- `src/` – TypeScript reference implementation
- `tests/` – Vitest checks (in-memory behavior)
- `scripts/` – Demo helpers

## Run (TypeScript demo)
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/escrow
npm install
npm run build
node dist/server.js
```

## Run tests
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/escrow
npm install
npx vitest run
```

## Environment
- `VOUCHER_HMAC_SECRET=...` (dev HMAC signing for vouchers)
- `PORT=8796`

## Notes
- The TypeScript verifier uses **HMAC** for demo purposes only.
- Solidity contracts are scaffolds and must be upgraded with ECDSA verification
  and proper access control.
