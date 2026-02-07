# Compat Control Plane (MVP)

Minimal HTTP control plane that accepts WordPress compatibility bundles,
creates jobs, and exposes reports for the wp-admin plugin.

## Endpoints
- `POST /v1/sites/connect` (API key)
- `POST /v1/sites/:siteId/bundles` (API key)
- `GET  /v1/jobs/:jobId`
- `GET  /v1/jobs/:jobId/report`
- `POST /v1/jobs/:jobId/complete`
- `POST /v1/wallets/challenge`
- `POST /v1/wallets/verify`
- `POST /v1/payments/create`
- `POST /v1/miner-proof/verify`

## Environment
- `PORT=8790`
- `DATA_DIR=/var/lib/ddns-compat`
- `ADMIN_API_KEY=change-me`
- `ALLOW_UNAUTHENTICATED=0`
- `PAYMENT_ADDRESS=0x...`
- `PAYMENT_ASSET=USDC`
- `PAYMENT_AMOUNT=5.00`
- `MAX_BODY_BYTES=2000000`
- `MINER_PROOF_SECRET=change-me`

## Notes
- Bundles are stored as JSON in `DATA_DIR/sites/<siteId>/bundles`.
- The MVP issues placeholder reports immediately for wp-admin preview.
- Signature verification should be replaced with SIWE + Solana adapters in
  production.
- Miner proof tokens use `proof_<nonce>.<hmac-sha256>` with the shared
  secret.
