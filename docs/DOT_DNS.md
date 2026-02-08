# .dns Namespace

The `.dns` namespace is our first-party registry. It is **not** ICANN DNS. Records resolve only from the internal registry and can be proven with Merkle proofs.

## Record Types
All `.dns` names **must** include an `OWNER` record.

- `OWNER`: required. Value is the L2 address or public key string (recommended: `ed25519:<base64>`).
- `NODE_PUBKEY`: node public key (`ed25519:<base64>`).
- `ENDPOINT`: HTTPS URL for node/gateway (`https://...`).
- `CAPS`: comma-separated capabilities (`cache,verify,store,proxy,tor`).
- `TEXT`: key/value object `{ "key": "...", "value": "..." }`.

Unknown types are rejected.

## Updates + Signing
Updates are owner-signed. The update payload is canonicalized and signed using Ed25519.

Sign:
```bash
node scripts/dns-sign.mjs \
  --name alice.dns \
  --owner ed25519:YWJj \
  --record "ENDPOINT:https://example.com" \
  --record "CAPS:cache,verify" \
  --record "TEXT:email=alice@example.com" \
  --nonce 1 \
  --private-key /path/to/ed25519_seed
```

Verify:
```bash
node scripts/dns-verify.mjs --file signed.json --registry registry/snapshots/registry.json
```

Updates **must** be rejected unless the signature matches the current `OWNER` record for the name.

## Proof Format
Proofs are included when `proof=1` is set and are verified against the anchored root (if available).

```json
{
  "root": "hex",
  "version": 1,
  "leaf": "hex",
  "siblings": ["hex", "hex"],
  "directions": ["left", "right"]
}
```

## Example Resolve
```bash
curl "http://localhost:8054/resolve?name=alice.dns&proof=1"
```

Expected fields:
- `network: "dns"`
- `records: [...]`
- `metadata.proof: {root, version, leaf, siblings, directions}`

## Node Naming Helper
```bash
node scripts/node-name.mjs --pubkey <base64|hex>
```
Output example:
```
node-1a2b3c4d5e.dns
```
