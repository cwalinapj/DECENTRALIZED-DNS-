# Node Agent + Credits (MVP)

## Overview
The Node Agent is an opt‑in worker that caches registry/proofs, verifies data, and submits signed receipts to the Credits Coordinator. Credits are non‑transferable and tied to a wallet holding a Passport NFT (currently enforced via allowlist).

## Receipt types
- `SERVE`: served a resolution/registry response.
- `VERIFY`: verified a challenged chunk hash.
- `STORE`: stored a snapshot or proof locally.

Receipts are Ed25519‑signed by the wallet key.

## Coordinator endpoints
- `POST /auth/challenge`
- `POST /auth/verify`
- `POST /receipts`
- `GET /credits?wallet=...`
- `POST /credits/spend`
- `POST /audits/challenge` (admin)

## Safety defaults
- Only protocol data is served by default.
- `.tor` and proxy chain are disabled unless:
  - `ALLOW_TOR=1`
  - `ALLOW_PROXY_CHAIN=1`

## Example flow
1. Request challenge, sign it, and exchange for session token.
2. Submit receipts to earn credits.
3. Spend credits for premium operations.

## Files
- Worker: `workers/node-agent/`
- Coordinator: `services/control-plane/credits-coordinator/`
- Shared types: `ddns-core/credits/`
