# Compat Control Plane (MVP)

Minimal HTTP control plane that accepts WordPress compatibility bundles,
creates jobs, and exposes reports for the wp-admin plugin.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/compat-control-plane
npm install
npm run build
PORT=8790 DATA_DIR=./data ADMIN_API_KEY=change-me npm start
```

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
- `POST /v1/toll-comments/refund`
- `POST /v1/toll-comments/forfeit`

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
- `TOLL_SITE_TOKEN=change-me`
- `TOLL_RPC_URL=https://rpc.example.com`
- `TOLL_ESCROW_CONTRACT=0x...`
- `TOLL_OPERATOR_KEY=0x...`

## Notes
- Bundles are stored as JSON in `DATA_DIR/sites/<siteId>/bundles`.
- The MVP issues placeholder reports immediately for wp-admin preview.
- Signature verification should be replaced with SIWE + Solana adapters in
  production.
- Miner proof tokens use `proof_<nonce>.<hmac-sha256>` with the shared
  secret.
