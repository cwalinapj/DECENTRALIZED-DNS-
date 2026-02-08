# Registry + Merkle Root

## Overview
The registry snapshot is a JSON file containing `.dns` records. A deterministic Merkle root is computed over all records sorted by name.

Records are normalized (lowercase, punycode) and canonicalized before hashing.

## Snapshot format
`registry/snapshots/registry.json`
```json
{
  "version": 1,
  "updatedAt": "2026-02-01T00:00:00Z",
  "records": [
    {
      "name": "alice.dns",
      "owner": "<pubkey>",
      "version": 1,
      "updatedAt": "2026-02-01T00:00:00Z",
      "records": [
        { "type": "TXT", "value": "ipfs://example", "ttl": 300 }
      ]
    }
  ]
}
```

## Canonical encoding
For each record:
- `name` normalized with punycode + lowercase
- `records[]` sorted by `type|value|ttl`
- JSON fields ordered as: `name`, `records`, `version`, `updatedAt`, optional `owner`

Leaf hash:
```
sha256("<normalized-name>\n<canonical-json>")
```

Merkle tree:
- Leaves sorted by normalized name
- Parent hash = sha256(left + right) as hex

## CLI
Build root and proof:
```bash
node scripts/registry-build-root.js --input registry/snapshots/registry.json --name alice.dns
```

## API
- `GET /registry/root`
- `GET /registry/proof?name=alice.dns`

## Verification
Use `ddns-core/src/registry_merkle.ts` for proof verification.
