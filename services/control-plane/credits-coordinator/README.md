# Credits Coordinator (MVP)

## Purpose
Provides wallet auth, receipt validation, and credit accounting for node agents.

## Endpoints
- `POST /auth/challenge` -> `{ wallet, challenge, expiresAt }`
- `POST /auth/verify` -> `{ token, expiresAt }`
- `GET /credits?wallet=<addr>` -> `{ wallet, balance }`
- `POST /credits/spend` (requires `x-session-token`)
- `POST /receipts` -> validates + credits
- `POST /audits/challenge` (admin only)

## Env
- `PORT` (default `8822`)
- `DATA_DIR` (default `./data`)
- `ADMIN_TOKEN` (for audits)
- `REGISTRY_ADMIN_TOKEN` (not used here)
- `SESSION_TTL_MS` (default 10m)
- `CREDITS_SERVE`, `CREDITS_VERIFY`, `CREDITS_STORE`
- `RESOLVER_PUBKEY_HEX` (required to enforce authority signatures)
- `ALLOW_UNVERIFIED_SERVE=1` (dev only)
- `MAX_RECEIPTS_PER_MIN` (default 60)
- `PASSPORT_ALLOWLIST` (comma-separated wallet pubkeys, used when passport disabled)
- `PASSPORT_ENABLED=1` (enable on-chain lookup)
- `PASSPORT_CHAIN=base`
- `ETH_RPC_URL` (Base RPC, required when enabled)
- `PASSPORT_CONTRACT` (ERC-721)
- `PASSPORT_TOKEN_TYPE=erc721`
- `PASSPORT_TOKEN_ID` (unused)
- `DAILY_CREDIT_CAP` (default 100)

## Run
```bash
npm install
npm run build
node dist/server.js
```

## Notes
Receipts are Ed25519-signed by wallet public keys. Passport ownership is currently enforced via `PASSPORT_ALLOWLIST` and persisted to `data/credits/passports.json`.
