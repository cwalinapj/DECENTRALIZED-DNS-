# AnchorV1

**Status:** Draft  
**Version:** 1  
**Purpose:** Define a minimal “Anchor” object for redundant storage/distribution (e.g., IPFS), enabling clients/watchdogs to detect tampering or equivocation without storing full RouteSets off-chain.

AnchorV1 is intentionally small. The primary authoritative data remains `RouteSetV1` distributed via the decentralized network and cached at the edge.

---

## 1. Design Goals

- **Minimal size** (fixed 217 bytes)
- **Tamper detection** via commitment to `routeset_hash`
- **Replay resistance** via `seq` and `exp`
- **Authenticity** via Ed25519 signature
- **No RR payload** stored (Anchor is not a record container)

---

## 2. Cryptography & Hashing

- **Signature algorithm:** Ed25519
- **Hash algorithm:** BLAKE3-256 (32 bytes)

---

## 3. Canonical Binary Encoding (AnchorV1)

- **Endianness:** little-endian for all integer fields (`u16/u32/u64`)
- **Padding:** none (packed, sequential fields)
- **Signature:** `sig` is computed over bytes from `magic` through `owner_pub` (excluding `sig`)

| Field          | Size | Type  | Description               |
|---------------|-----:|-------|---------------------------|
| magic         | 4    | bytes | ASCII `ANCH`              |
| version       | 1    | u8    | `0x01`                    |
| ns_id         | 4    | u32   | namespace id              |
| name_id       | 32   | bytes | derived identifier        |
| seq           | 8    | u64   | sequence number           |
| exp           | 8    | u64   | expiry unix seconds       |
| routeset_hash | 32   | bytes | hash of the RouteSet      |
| owner_pub     | 32   | bytes | Ed25519 public key        |
| sig           | 64   | bytes | signature                 |

**Total size:** 217 bytes



payload = encode_anchor_without_sig(anchor)
sig = ed25519_sign(owner_priv, payload)


## 4. Signature Rules

### 4.1 Signing payload
The signing payload is the canonical bytes from `magic` through `owner_pub` inclusive (excluding `sig`).


### 4.2 Verification
Verification succeeds if:
- `magic == "ANCH"`
- `version == 1`
- `ed25519_verify(owner_pub, payload, sig) == true`

---

## 5. Validity Rules (Client/Watchdog)

An AnchorV1 is valid only if:
- `exp` is in the future relative to verifier clock (allow small skew, e.g. ±120s)
- `seq` is >= last accepted seq for this `name_id` (recommended strictly increasing policy)
- `ns_id` and `name_id` match the expected namespace/name

---

## 6. Matching Anchor to RouteSet

Given:
- AnchorV1 with `routeset_hash = H`
- A fetched `RouteSetV1` byte string

Compute:
H’ = BLAKE3_256( canonical_routeset_bytes_including_sig )

Match succeeds if `H' == H`.

If mismatch:
- treat served RouteSet as **untrusted**
- refetch from multiple peers and/or require chain confirmation
- watchdogs should emit an incident report

---

## 7. Storage Policy

**Default policy:** store only AnchorV1 on IPFS (or other redundancy storage).

Storing full RouteSets on IPFS is permitted only in explicit “bootstrap mode” and MUST NOT be required for correctness.

---

## 8. Relationship to Chain Commitments

Chain commitments SHOULD store at minimum:

name_id -> (seq, exp, routeset_hash)

Optionally, the chain MAY also store `anchor_hash = BLAKE3_256(anchor_bytes_including_sig)` if you want to commit to the anchor object itself.
See `specs/chain/commitments.md`.


