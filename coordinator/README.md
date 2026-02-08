# Credits Coordinator (MVP)

## Purpose
Provides wallet auth (Solana-first), receipt validation, and credit accounting for the MVP comment toll flow.

## Endpoints (MVP)
Auth (Solana-first):
- `POST /comments/auth/challenge` -> `{ wallet, challenge, expiresAt }`
- `POST /comments/auth/verify` -> `{ ok: true }`

Credits + comment tolls:
- `GET /credits?wallet=<sol_pubkey>` -> `{ wallet, balance }`
- `POST /comments/hold` (requires `x-ddns-site-token`)
- `POST /comments/submit` (optional)
- `POST /comments/finalize`
- `GET /site-pool?site_id=...` (requires `x-ddns-site-token`)

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
