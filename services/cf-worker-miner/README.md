# Cloudflare Worker Miner (MVP)

Edge resolver worker for ICANN names with multi-upstream DoH quorum.

## Endpoints
- `GET /v1/health`
- `GET /resolve?name=netflix.com&type=A`

Response keys:
- `name`, `type`, `answers`, `ttl_s`
- `rrset_hash`, `confidence`
- `upstreams_used[]`, `chosen_upstream`

## Config
- `UPSTREAMS` default: `https://cloudflare-dns.com/dns-query,https://dns.google/resolve`
- `TIMEOUT_MS` default: `2000`
- `OVERLAP_RATIO` default: `0.34`
- `RECEIPT_ENDPOINT` optional: POST normalized observations to miner-witness.

## Run
```bash
cd services/cf-worker-miner
npm i
npm run dev
```

## Deploy
```bash
cd services/cf-worker-miner
npm run deploy
```
