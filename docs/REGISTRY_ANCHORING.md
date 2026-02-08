# Registry Anchoring

## Overview
Anchoring records the current registry Merkle root into a durable store so later verifiers can compare proofs against a committed root. MVP anchoring writes to a local JSON store under `settlement/anchors/anchors.json`.

This is the bridge to future escrow/voucher settlement: resolvers can prove a response against a root that was anchored alongside settlement windows.

## Anchor record
Stored fields:
- `root`
- `version`
- `timestamp`
- `source` (build hash / git SHA / system identifier)

## Anchor via API
Enable registry + provide admin token:
```bash
REGISTRY_ENABLED=1 REGISTRY_ADMIN_TOKEN=devtoken ./scripts/dev.sh
```

Anchor:
```bash
curl -X POST "http://localhost:8054/registry/anchor" \
  -H "content-type: application/json" \
  -H "x-admin-token: devtoken" \
  -d '{
    "root": "<hex>",
    "version": 1,
    "timestamp": "2026-02-08T00:00:00Z",
    "source": "git:fecf228"
  }'
```

Fetch anchored root:
```bash
curl "http://localhost:8054/registry/root"
```
Response includes `anchoredRoot`.

## Anchor via CLI
```bash
node scripts/registry-anchor.mjs \
  --root <hex> \
  --version 1 \
  --timestamp 2026-02-08T00:00:00Z \
  --source git:fecf228
```

## Verifying proofs
1. Get the anchored root:
```bash
curl "http://localhost:8054/registry/root"
```
2. Get proof for a name:
```bash
curl "http://localhost:8054/registry/proof?name=alice.dns"
```
3. Verify with `ddns-core/src/registry_merkle.ts` using `verifyProof(root, leaf, proof)`.

## Future tie-in
In later phases, the anchor record will be persisted on-chain or in settlement/escrow windows to prove the registry state at a given time.
