# core

`core` is the shared library for **DECENTRALIZED-DNS**. It implements the **native record formats** and the **verification primitives** used by:

- `gateway/`
- `client/` (CLI + web onboarding)
- `adapters/` (e.g., `web3-name-gateway`)
- any router / Raspberry Pi agent

This library is the single source of truth for:
- name normalization
- `.dns` label rules (length + reserved words)
- `name_id` derivation
- canonical encoding/decoding of `RouteSetV1` and `AnchorV1`
- hashing (`routeset_hash`)
- Ed25519 signing + verification
- GatewayRoutesV1 encoding/decoding (routing gateway sets)

> IPFS is **anchor-only** by default: `core` supports building/verifying `AnchorV1`, but does not require storing full RouteSets on IPFS.

---

## Directory Layout

```text
core/
  README.md
  src/
    normalize.*        # NameNormalization.md implementation
    name_id.*          # name_id derivation (BLAKE3-256)
    routeset.*         # RouteSetV1 encode/decode/hash/sign/verify
    anchor.*           # AnchorV1 encode/decode/hash/sign/verify
    crypto_ed25519.*   # Ed25519 helpers + key handling
  tests/

## Run tests
```bash
cd /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/core
npm install
npx vitest run
```
