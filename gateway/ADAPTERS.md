# Gateway Adapter Layer

This folder contains the gateway service and its adapter layer, which normalizes answers from multiple naming/content systems into a single `RouteAnswer` shape.

MVP vs end-state:
- MVP: adapters normalize answers and return best-effort proofs (PKDNS merkle proof, ENS/SNS read-only, IPFS CID validation).
- End-state: miners/quorum/canonical finalization + receipts make route updates censorship-resistant; adapters remain the I/O surface.

## Quick verify (60s)

CLI (adapter output):

```bash
npm -C gateway run build
npm -C gateway run adapter:query -- --name alice.dns --registry-path gateway/tests/fixtures/registry.json --anchor-store-path gateway/tests/fixtures/anchors-empty.json
```

HTTP (gateway endpoint):

```bash
REGISTRY_ENABLED=1 \
REGISTRY_PATH=gateway/tests/fixtures/registry.json \
ANCHOR_STORE_PATH=gateway/tests/fixtures/anchors-empty.json \
npm -C gateway run build && npm -C gateway start

curl 'http://localhost:8054/v1/resolve-adapter?name=alice.dns'
```

Expected top-level keys (not exhaustive):
- `name`
- `nameHashHex` (also `name_hash`)
- `dest`
- `destHashHex` (also `dest_hash`)
- `ttlS` (also `ttl_s`)
- `source` (includes `kind`)
- `proof`
