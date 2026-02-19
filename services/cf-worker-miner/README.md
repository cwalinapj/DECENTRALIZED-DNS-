# Cloudflare Worker Miner (MVP)

This worker provides a simple miner-compatible DNS resolve surface with confidence + upstream audit fields.

## Prereqs

- Node 18+
- Cloudflare account
- One-time browser login (`wrangler login`)

Wrangler cannot create Cloudflare accounts or bypass CAPTCHA/email verification.

## Install

```bash
cd services/cf-worker-miner
npm install
```

## Deploy

```bash
cd services/cf-worker-miner
npx wrangler login
npx wrangler deploy
```

## Dev mode

```bash
cd services/cf-worker-miner
npx wrangler dev
```

## Config

Via `wrangler.toml`:

- `UPSTREAMS` default: `https://cloudflare-dns.com/dns-query,https://dns.google/dns-query`
- `TIMEOUT_MS` default: `2500`
- `OVERLAP_RATIO` default: `0.34`
- `RECEIPT_ENDPOINT` optional

Via secret:

```bash
npx wrangler secret put RECEIPT_ENDPOINT
```

## Verify output shape

```bash
curl '<WORKER_URL>/v1/health'
curl '<WORKER_URL>/resolve?name=netflix.com&type=A'
```

Expected fields:

- `name`
- `type`
- `source`
- `confidence`
- `rrset_hash`
- `answers`
- `ttl_s`
- `chosen_upstream`
- `upstreams_used`
