# CLOUDFLARE_DEPLOY

This document covers MVP deployment of the Cloudflare worker miner starter (`services/cf-worker-miner`).

## Prerequisites

- Cloudflare account with Workers enabled.
- Wrangler CLI authenticated (`wrangler login`).
- Repo checked out and dependencies installed.

## 1) Install + deploy

```bash
cd services/cf-worker-miner
npm install
npm run build
npm run deploy
```

Expected:
- Wrangler outputs a worker URL.
- Deployment succeeds without embedding secrets in source.

## 2) Required environment variables

Set via Wrangler secrets/vars, not committed files:

- `UPSTREAM_CF` (default DoH endpoint: `https://cloudflare-dns.com/dns-query`)
- `UPSTREAM_GOOG` (default DoH endpoint: `https://dns.google/resolve`)
- `RECURSIVE_TIMEOUT_MS` (example: `2000`)
- `RECURSIVE_QUORUM_MIN` (example: `2`)

Optional:

- `RECEIPT_ENDPOINT` (if forwarding receipts to miner-witness service)
- `RECEIPT_ENABLED` (`0`/`1`)

## 3) Test endpoint

```bash
curl "https://<your-worker>/resolve?name=netflix.com&type=A"
```

Expected response shape:

- `rrset_hash`
- `confidence`
- `ttl_s`
- `answers`
- `upstreams_used`

## Security notes

- Do not commit `wrangler` API tokens or secrets.
- Keep receipt forwarding optional and env-driven.
- Worker should emit privacy-safe observation data only (no raw user identity capture).
