# Vaults (Wallet Passwords + API Keys)

Vaults store encrypted secrets for each wallet. Data is encrypted client-side and
stored on miner-local buckets with optional S3 backup.

## Storage Layout
- Miner bucket: `miners/vaults/<wallet-id>/vault.json.enc`
- Optional backup: encrypted snapshot to S3

## Encryption Model
- Per-wallet root key derived from wallet signature + miner secret + salt.
- Per-entry data key derived from the root key.
- Hardware wallet required for sensitive operations such as rotation or export.

## Vault Entry Format
```json
{
  "id": "api-key-1",
  "type": "api_key",
  "ciphertext": "base64",
  "key_id": "k1",
  "created_at": "2026-02-07T00:00:00Z",
  "rotated_at": null
}
```

## Rotation Flow
1. Client requests rotation with wallet signature.
2. Hardware wallet signs for step-up approval.
3. Vault service replaces entry and records `rotated_at`.
4. Optional S3 snapshot is updated.

## Access Control
- Primary access via mTLS from miner firmware.
- Optional API token for operators and automated jobs.
- Wallet signatures required for destructive actions.
