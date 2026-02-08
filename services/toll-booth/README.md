# Toll Booth (MVP)

Minimal verifier for route submissions with witness quorum + toll pass checks.

## Run
```bash
npm install
npm run dev
```

## Config
- `config/trusted_witnesses.json`: list of base58 pubkeys that can attest.
- `config/owners_allow.json`: allow-list of owner pubkeys (fallback if RPC check fails).
- Env vars:
  - `PORT` (default 8787)
  - `SOLANA_RPC_URL` (default https://api.devnet.solana.com)
  - `DDNS_PROGRAM_ID` (default devnet program id)
  - `QUORUM` (default 2)

## Endpoints
`POST /v1/route/submit`
```json
{
  "route": { "v":1,"name":"example.dns","dest":"https://example.com","ttl":300,"issued_at":0,"expires_at":0,"owner":"<pubkey>","nonce":"..." },
  "witnesses": [{ "v":1,"route_id":"<hex>","witness":"<pubkey>","sig":"<base64>","ts":0 }]
}
```

`GET /v1/route/:route_id`

## Notes
- Requires at least `QUORUM` valid witness signatures from `trusted_witnesses.json`.
- Verifies owner has a toll pass PDA on-chain (or allow-list fallback).
- Accepted routes are stored in `tollbooth-db/`.
