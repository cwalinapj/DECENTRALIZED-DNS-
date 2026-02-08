# Session Tokens (Client Convenience)

Session tokens allow non-ASIC clients to avoid per-request signing while still
paying tolls from escrow.

## Model
- Client performs a one-time wallet signature to obtain a short-lived token.
- Token is bound to wallet address + rate limit + TTL.
- Gateway/toll gate validates token and debits escrow in batches.

## Gateway API (MVP)
`POST /session` with JSON:
```json
{
  "account": "demo",
  "currency": "spl_usdc",
  "nonce": "n1",
  "ts": 1700000000,
  "ttl": 300,
  "max_requests": 50,
  "pubkey": "0x...",
  "sig": "0x..."
}
```

Use `x-ddns-session: <token>` on subsequent `GET /dns-query` calls.

## Miner Plugin Use
- Miner plugins (e.g., WordPress) can auto-refresh tokens in the background.
- Users do not need to click "approve" for every request.

## Chain Compatibility
- SPL escrow → Ed25519 signing
- L2 ERC-20 escrow → secp256k1 signing

Tokens can carry a `currency` field to select the signing scheme.
