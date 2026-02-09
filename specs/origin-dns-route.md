# Origin DNS Route (MVP)

This document defines the on-chain route record format used by the MVP Tollbooth and returned by Gateway resolve.

## Deterministic Hashes
- `name` is the full name (lowercase) including `.dns`, e.g. `example.dns`.
- `name_hash = sha256(utf8(name))` (32 bytes)
- `dest_hash = sha256(utf8(dest))` (32 bytes)

## On-Chain RouteRecord (Anchor)
PDA:
- `route_record_pda = PDA(["record", owner_wallet_pubkey, name_hash], program_id)`

Fields:
- `owner: Pubkey`
- `name_hash: [u8;32]`
- `dest_hash: [u8;32]`
- `ttl: u32` (seconds)
- `updated_at: i64` (unix seconds)
- `bump: u8`

## NameRecord (Global Uniqueness)
PDA:
- `name_record_pda = PDA(["name", name_hash], program_id)`

Fields (MVP):
- `name_hash: [u8;32]`
- `label_len: u8`
- `label_bytes: [u8;32]`
- `owner_mint: Pubkey` (passport mint)
- `owner_wallet: Pubkey`
- `created_at: i64`
- `bump: u8`

## Gateway Resolve Response
`GET /v1/resolve?name=<example.dns>&wallet=<pubkey>`

Response:
```json
{
  "ok": true,
  "name": "example.dns",
  "wallet": "<base58 pubkey>",
  "dest": "https://example.com",
  "ttl": 300,
  "dest_hash_hex": "<64 hex>",
  "proof": {
    "program_id": "<base58>",
    "record_pda": "<base58>",
    "slot": 0,
    "signature": "<tx signature or null>"
  }
}
```

Notes:
- MVP stores `dest` off-chain for convenience; the authoritative on-chain value is `dest_hash`.
- Gateway should verify `sha256(dest) == dest_hash` when `dest` is present.
