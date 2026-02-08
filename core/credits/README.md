# Credits Receipts (Envelope Schema)

This module defines the receipt schema used by node agents and the coordinator.

## Receipt JSON
```json
{
  "type": "SERVE",
  "node_id": "base64(pubkey)",
  "ts": 1738920000,
  "request": {"name":"example.com"},
  "result_hash": "blake3base64(...)",
  "bytes": 512
}
```

## Envelope
```json
{
  "receipt": { ... },
  "signature": "base64(ed25519sig)",
  "public_key": "base64(ed25519pub)"
}
```

## Notes
- `node_id` MUST equal `public_key`.
- `signature` is computed over `receipt` canonical JSON with the prefix `receipt\n`.
