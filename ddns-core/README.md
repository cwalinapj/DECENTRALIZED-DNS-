# ddns-core

`ddns-core` is the shared core library for **DECENTRALIZED-DNS**. It implements the **native record formats** and the **verification primitives** used by:

- `resolver/`
- `watchdogs/`
- `client/` (CLI + web onboarding)
- `adaptors/` (e.g., `web3-name-gateway`)
- any router / Raspberry Pi agent

This library is the single source of truth for:
- name normalization
- `name_id` derivation
- canonical encoding/decoding of `RouteSetV1` and `AnchorV1`
- hashing (`routeset_hash`)
- Ed25519 signing + verification

> IPFS is **anchor-only** by default: `ddns-core` supports building/verifying `AnchorV1`, but does not require storing full RouteSets on IPFS.

---

## Directory Layout

```text
ddns-core/
  README.md
  src/
    normalize.*        # NameNormalization.md implementation
    name_id.*          # name_id derivation (BLAKE3-256)
    routeset.*         # RouteSetV1 encode/decode/hash/sign/verify
    anchor.*           # AnchorV1 encode/decode/hash/sign/verify
    crypto_ed25519.*   # Ed25519 helpers + key handling
  tests/
