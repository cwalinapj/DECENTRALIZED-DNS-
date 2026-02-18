# cache-rollup (MVP)

Chronological cache rollup service for premium `.dns` parents.

## Endpoints

- `POST /v1/ingest` body: `{ entries: CacheEntryV1[] }`
- `POST /v1/rollup?parent=<name>&epoch=<u64>` builds cache root, optionally publishes to IPFS, optionally updates on-chain cache head
- `GET /v1/cache-head?parent=<name>` reads `ddns_cache_head` PDA from chain

## Env

- `PORT` default `8788`
- `SOLANA_RPC_URL` default `https://api.devnet.solana.com`
- `DDNS_CACHE_HEAD_PROGRAM_ID` required for on-chain read/set
- `ROLLUP_SIGNER_KEYPAIR` optional path to keypair (used for on-chain set)
- `IPFS_API_URL` optional (`/api/v0/add` endpoint); fallback emits local CID placeholder
- `DATA_DIR` default `services/cache-rollup/data`

## Quickstart

```bash
npm -C services/cache-rollup install
npm -C services/cache-rollup run dev

curl -X POST http://localhost:8788/v1/ingest \
  -H 'content-type: application/json' \
  -d '{"entries":[{"version":1,"name_hash":"'"$(printf 'aa%.0s' {1..32})"'","parent_name_hash":"'"$(printf 'bb%.0s' {1..32})"'","rrset_hash":"'"$(printf 'cc%.0s' {1..32})"'","ttl_s":60,"confidence_bps":9000,"observed_bucket":1738800000,"witness_pubkey":"'"$(printf '11%.0s' {1..32})"'","signature":"'"$(printf '22%.0s' {1..64})"'"}]}'

curl -X POST 'http://localhost:8788/v1/rollup?parent=acme.dns&epoch=1'
curl 'http://localhost:8788/v1/cache-head?parent=acme.dns'
```
