# Cloudflare Public Demo Endpoint (Gateway-as-a-Service)

This service publishes a shareable resolver demo URL using Cloudflare Workers.

## What it does

- `GET /healthz`
- `GET /v1/resolve?name=<domain>&type=A|AAAA`
- `GET|POST /dns-query` (RFC8484 wireformat)

The demo focuses on ICANN recursive resolution + quorum metadata (`confidence`, `upstreams_used`, `chosen_upstream`, `rrset_hash`, `cache`).

## Security model

- No Cloudflare token is committed to this repository.
- Deploy auth is interactive (`wrangler login`) or environment-based (`CLOUDFLARE_API_TOKEN`).
- Runtime requests do not require Cloudflare API tokens.

## First-time setup

1. Create a Cloudflare account.
2. Install Wrangler: `npm i -D wrangler` (or use repo scripts below).
3. Authenticate once:

```bash
cd services/cf-demo-gateway
npm i
npx wrangler login
```

Wrangler account login requires browser email/CAPTCHA once.

## Deploy

From repo root:

```bash
npm run demo:cf:deploy
```

Or directly:

```bash
cd services/cf-demo-gateway
npm i
npx wrangler deploy
```

Token-based deploy (non-interactive):

```bash
export CLOUDFLARE_API_TOKEN=<token>
cd services/cf-demo-gateway
npm i
npx wrangler deploy
```

## Local preview / verify

```bash
npm run demo:cf:dev
curl 'http://127.0.0.1:8788/healthz'
curl 'http://127.0.0.1:8788/v1/resolve?name=netflix.com&type=A'
```

## Public endpoint verify

After deploy, replace `<demo-url>` with your worker URL:

```bash
curl 'https://<demo-url>/healthz'
curl 'https://<demo-url>/v1/resolve?name=netflix.com&type=A'
```

## Optional RFC8484 check

`/dns-query` accepts and returns `application/dns-message` wireformat.
Use `scripts/firefox_doh_verify.sh` for a standard DoH smoke test.
