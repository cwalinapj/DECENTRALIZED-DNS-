# Miner Quickstart (Cloudflare Worker)

This is the fastest MVP path for joining as a Cloudflare Worker miner.

## Canonical call-to-action

Deploy a miner in 3 minutes -> earn REP / TOLL (policy-governed by current MVP settings).

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
bash scripts/miner_cf_verify.sh --url "<WORKER_URL>" --name "netflix.com" --type "A"
```

For self-signed local HTTPS during testing, add `--insecure`:

```bash
bash scripts/miner_cf_verify.sh --url "https://127.0.0.1:8443" --name "netflix.com" --type "A" --insecure
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
- `verify: FAIL resolve status=...`:
  - confirm your worker URL has no trailing path (must be base URL only).
- `verify: FAIL schema mismatch`:
  - confirm your worker returns `rrset_hash`, `confidence`, `upstreams_used`, `chosen_upstream`, `ttl_s`.

## UI onboarding page

Open:
- `docs/miner-onboard/index.html`

Automated verifier:
- `scripts/miner_cf_verify.sh`
