# Cloudflare Worker Miner (MVP)

Edge resolver worker for ICANN names with multi-upstream DoH quorum.

## Endpoints
- `GET /v1/health`
- `GET /resolve?name=netflix.com&type=A`

Response keys (gateway-compatible):
- `name`, `type`, `answers`, `ttl_s`
- `rrset_hash`, `confidence`
- `upstreams_used[]`, `chosen_upstream`

## Environment variables

Defaults are set in `wrangler.toml`:
- `UPSTREAMS=https://cloudflare-dns.com/dns-query,https://dns.google/resolve`
- `TIMEOUT_MS=2000`
- `OVERLAP_RATIO=0.34`
- `RECEIPT_ENDPOINT` optional (observation forwarding; failures ignored)

Set via `wrangler.toml` `[vars]` or via secret for sensitive values:

```bash
cd services/cf-worker-miner
npx wrangler secret put RECEIPT_ENDPOINT
```

## Deploy (copy/paste)

Wrangler cannot create Cloudflare accounts. You must complete Cloudflare
account creation and the one-time browser email/CAPTCHA flow first.

```bash
cd services/cf-worker-miner
npm i
npx wrangler login
npx wrangler deploy
```

## Local development

```bash
cd services/cf-worker-miner
npm i
npx wrangler dev
```

## Verify deployed output

```bash
curl "https://<worker>.workers.dev/v1/health"
curl "https://<worker>.workers.dev/resolve?name=netflix.com&type=A"
```

Expected fields:
- `name`, `type`, `answers`, `ttl_s`
- `confidence`, `rrset_hash`
- `upstreams_used`, `chosen_upstream`
