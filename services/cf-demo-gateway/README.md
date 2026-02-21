# Cloudflare Demo Gateway

Public demo gateway worker for ICANN recursive resolution with quorum metadata.

## Endpoints

- `GET /` (public demo UI with share links)
- `GET /healthz`
- `GET /v1/resolve?name=netflix.com&type=A|AAAA`
- `GET|POST /dns-query` (RFC8484 wireformat)

## Local dev

```bash
npm i
npx wrangler dev --local --port 8788
```

## Deploy

Interactive (recommended):

```bash
npm i
npx wrangler login
npx wrangler deploy
```

Token-based (CI/manual):

```bash
export CLOUDFLARE_API_TOKEN=<token>
npx wrangler deploy
```

Notes:
- `CLOUDFLARE_API_TOKEN` is deploy-time only and must never be committed.
- Runtime does not require Cloudflare API tokens.

## Quick verify

```bash
curl 'http://127.0.0.1:8788/healthz'
curl 'http://127.0.0.1:8788/v1/resolve?name=netflix.com&type=A'
```

UI:

```bash
open 'http://127.0.0.1:8788/?name=netflix.com&type=A'
```
