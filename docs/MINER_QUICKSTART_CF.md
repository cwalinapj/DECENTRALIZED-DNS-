# Miner Quickstart (Cloudflare Worker)

## 1) Create Cloudflare account (free)

- Sign up at Cloudflare.
- You must complete email verification/CAPTCHA in browser.

## 2) Login Wrangler once

```bash
cd services/cf-worker-miner
npm install
npx wrangler login
```

Wrangler cannot create accounts or bypass CAPTCHA/email verification.

## 3) One-command deploy (after login)

```bash
cd /Users/root1/scripts/ddns-cf-miner-onboarding
npm run miner:cf:deploy
```

## 4) Verify endpoints

```bash
curl '<WORKER_URL>/v1/health'
curl '<WORKER_URL>/resolve?name=netflix.com&type=A'
```

Expected resolve keys:
- `name`, `type`, `source`, `confidence`
- `rrset_hash`, `answers`, `ttl_s`
- `chosen_upstream`, `upstreams_used`

## Required env vars (defaults)

| Var | Default |
|---|---|
| `UPSTREAMS` | `https://cloudflare-dns.com/dns-query,https://dns.google/dns-query` |
| `TIMEOUT_MS` | `2500` |
| `OVERLAP_RATIO` | `0.34` |
| `RECEIPT_ENDPOINT` | empty |

## Troubleshooting

- `wrangler: command not found`:
  - `npm install` inside `services/cf-worker-miner`
- `Not authenticated`:
  - run `npx wrangler login`
- deploy succeeded but URL unknown:
  - run `npx wrangler deployments list`
