# Cloudflare Worker Miner (MVP)

This worker provides a minimal miner-friendly resolve surface with quorum metadata.

## What it returns

`GET /resolve?name=<domain>&type=A|AAAA` returns:

- `name`
- `type`
- `answers`
- `ttl_s`
- `source`
- `confidence`
- `rrset_hash`
- `chosen_upstream`
- `upstreams_used`

This shape is aligned with gateway quorum/debug expectations.

## Prerequisites

- Node 18+
- Cloudflare account (free tier)
- Wrangler CLI (installed via npm scripts in this folder)

## Deploy (exact commands)

```bash
cd services/cf-worker-miner
npm install
npx wrangler login
npx wrangler deploy
```

Important:
- Wrangler cannot create Cloudflare accounts or bypass CAPTCHA/email verification.
- You must complete browser login once.

## Variables

Two supported methods:

1) `wrangler.toml` `[vars]`
- `UPSTREAMS` default `https://cloudflare-dns.com/dns-query,https://dns.google/resolve`
- `TIMEOUT_MS` default `2000`
- `OVERLAP_RATIO` default `0.34`
- `RECEIPT_ENDPOINT` optional (empty by default)

2) Secrets / command line

```bash
npx wrangler secret put RECEIPT_ENDPOINT
```

## Verify after deploy

Replace `<WORKER_URL>`:

```bash
curl "<WORKER_URL>/v1/health"
curl "<WORKER_URL>/resolve?name=netflix.com&type=A"
```

Expected:
- `/v1/health` returns `ok: true`
- `/resolve` returns a JSON object with confidence + upstream metadata + rrset hash.
