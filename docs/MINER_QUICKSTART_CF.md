# Miner Quickstart (Cloudflare Worker)

This is the fastest MVP path for joining as a Cloudflare Worker miner.

## Prerequisites

- Git clone of this repo
- Node 18+
- Cloudflare account (free)

Important:
- Wrangler cannot create accounts or bypass CAPTCHA/email verification.
- You must complete login once in the browser.

## Step-by-step

1) Create/confirm Cloudflare account (free tier) in browser.

2) Enable Workers on free tier and login once:

```bash
cd services/cf-worker-miner
npm install
npx wrangler login
```

3) Deploy:

```bash
cd /Users/root1/DECENTRALIZED-DNS-
npm run miner:cf:deploy
```

4) Verify:

```bash
curl "<WORKER_URL>/v1/health"
curl "<WORKER_URL>/resolve?name=netflix.com&type=A"
```

Expected resolve payload fields:
- `confidence`
- `upstreams_used`
- `chosen_upstream`
- `rrset_hash`
- `answers`
- `ttl_s`

## Configure variables

Set defaults in `services/cf-worker-miner/wrangler.toml` `[vars]`:

- `UPSTREAMS`
- `TIMEOUT_MS`
- `OVERLAP_RATIO`
- `RECEIPT_ENDPOINT` (optional)

Optional secrets path:

```bash
cd services/cf-worker-miner
npx wrangler secret put RECEIPT_ENDPOINT
```

## Local dev mode

```bash
cd /Users/root1/DECENTRALIZED-DNS-
npm run miner:cf:dev
```

## Troubleshooting

- `wrangler: command not found`:
  - run `npm install` in `services/cf-worker-miner`.
- `Authentication required`:
  - run `npx wrangler login`.
- Worker URL not shown:
  - run `npx wrangler deployments list` and copy the workers.dev URL.

## UI onboarding page

Open:
- `docs/miner-onboard/index.html`
