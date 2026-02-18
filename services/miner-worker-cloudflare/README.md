# Cloudflare Worker Miner Kit (MVP)

This worker collects DNS observations and sends them to a local miner relay that submits REP awards on-chain.

## Flow
1. Worker resolves names via DoH.
2. Worker builds lightweight receipt objects (`name_hash`, `rrset_hash`, `colo`).
3. Worker POSTs receipts to `MINER_API_URL`.
4. Local relay submits `award_rep(...)` to `ddns_rep`.

## Run
```bash
cd services/miner-worker-cloudflare
npm install
npm run dev
# then call /run
curl 'http://127.0.0.1:8787/run'
```

Set these vars in `wrangler.toml` or Wrangler secrets:
- `MINER_API_URL`
- `DOH_URL`
- `NAMES`
- `QTYPE`
