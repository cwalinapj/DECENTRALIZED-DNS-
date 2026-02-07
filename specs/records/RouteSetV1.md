# GatewayRoutesV1

**Status:** Draft  
**Version:** 1  
**Purpose:** Define a compact, deterministic, signed ruleset that maps
**subdomain patterns** under a parent name to **gateway route targets**.

GatewayRoutesV1 is intended to be:

- distributed primarily via the decentralized DNS network and edge caches
- optionally backed up via IPFS (as redundancy)
- committed on-chain only by **hash** (see `specs/chain/commitments.md`)

This spec is designed for routers/firmware friendliness: simple pattern
matching, bounded rule sets, and deterministic binary encoding.

---

## 1. Design Goals

- **Small** (typically a few hundred bytes)
- **Deterministic** (canonical encoding + sorting rules)
- **Signed** (Ed25519)
- **Replay-resistant** (`g_seq` + `g_exp`)
- **Router-friendly matching** (exact label or wildcard label)

---

## 2. Terminology

- **Parent name**: the base name that owns the ruleset (e.g., `example`)
- **Child name**: a subdomain name under the parent (e.g., `api.example`)
- **Label**: dot-separated component of a name (e.g., `api`, `example`)
- **Pattern label**: either a concrete label or wildcard `*`

---

## 3. Cryptography & Hashing

- **Signature algorithm:** Ed25519
- **Hash algorithm (for commitments):** BLAKE3-256 (32 bytes)

On-chain commits to:

- `gateway_routes_hash = BLAKE3_256(canonical_gatewayroutes_bytes_including_sig)`

---

## 4. High-level Structure

GatewayRoutesV1 contains:

- namespace id (u32)
- parent_name_id (32 bytes)
- delegation sequence (u64) `g_seq`
- delegation expiry (u64) `g_exp`
- gateway sets (0..M)
- routing rules (0..N)
- owner public key (32 bytes)
- signature (64 bytes)

---

## 5. Canonical Binary Encoding

### 5.1 Endianness

All integer fields are **little-endian**.

### 5.2 Canonical ordering (determinism)

Before encoding:

1. Gateway sets MUST be sorted by `gateway_set_id` ascending.
2. Rules MUST be sorted by:
   `(pattern_len, pattern_bytes, gateway_set_id, priority)` ascending, bytewise.

### 5.3 Byte layout

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| magic | 4 | bytes | ASCII `GWRT` |
| version | 1 | u8 | `0x01` |
| ns_id | 4 | u32 | namespace id |
| parent_name_id | 32 | bytes | name_id of parent |
| g_seq | 8 | u64 | delegation sequence |
| g_exp | 8 | u64 | delegation expiry unix seconds |
| gwset_count | 2 | u16 | number of gateway sets |
| rule_count | 2 | u16 | number of rules |
| gateway_sets | var | list | repeated `GatewaySetV1` |
| rules | var | list | repeated `GatewayRuleV1` |
| owner_pub | 32 | bytes | Ed25519 public key |
| sig | 64 | bytes | signature |

---

## 6. GatewaySetV1

A "gateway set" is a small list of targets that can serve as routing endpoints.

### 6.1 Layout

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| gateway_set_id | 4 | u32 | identifier referenced by rules |
| target_count | 1 | u8 | number of targets (0..255) |
| targets | var | list | repeated `GatewayTargetV1` |

### 6.2 GatewayTargetV1 layout

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| kind | 1 | u8 | target kind (see below) |
| data_len | 2 | u16 | length of `data` |
| data | var | bytes | kind-specific payload |

**Target kinds (v1):**

- `1 = NODE_ID`  
  - data: 32 bytes (node identifier / peer id hash)
- `2 = IPV4_PORT`  
  - data: 4 bytes IPv4 + 2 bytes port (network order)
- `3 = IPV6_PORT`  
  - data: 16 bytes IPv6 + 2 bytes port (network order)
- `4 = DNS_NAME`
  - data: UTF-8 bytes of normalized ASCII DNS name (no trailing dot)

> Keep target kinds minimal in v1. Add new kinds only in a new version
> or with explicit compatibility rules.

---

## 7. GatewayRuleV1

A rule maps a subdomain **pattern** to a `gateway_set_id`.

### 7.1 Pattern model (router-friendly)

Patterns match labels under the parent name:

- Pattern is a sequence of **labels** applied to the child name portion only.
- Each pattern label is either:
  - exact label bytes (ASCII lowercase, punycode allowed)
  - wildcard label `*` (matches any single label)

Examples under parent `example`:

- `api` matches `api.example`
- `*` matches `<anything>.example` (one label deep)
- `svc.*` matches `svc.<anything>.example` (two labels deep)
- `*.*` matches `<a>.<b>.example`

**No regex. No glob beyond `*` per-label.**

### 7.2 Layout

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| priority | 1 | u8 | lower = higher priority |
| flags | 1 | u8 | rule flags |
| pattern_len | 1 | u8 | number of labels in pattern (0..255) |
| pattern | var | list | repeated `PatternLabelV1` |
| gateway_set_id | 4 | u32 | gateway set to use |

### 7.3 PatternLabelV1 layout

| Field | Size | Type | Description |
| --- | --- | --- | --- |
| kind | 1 | u8 | 1=EXACT, 2=WILDCARD |
| len | 1 | u8 | length of label (0 if wildcard) |
| bytes | var | bytes | label bytes (EXACT only) |

**Label constraints:**

- EXACT label bytes MUST be lowercase ASCII (punycode allowed)
- len MUST be 1..63 for EXACT
- wildcard uses `kind=2` and `len=0` with no bytes

### 7.4 Rule flags (u8)

Recommended flags:

- bit 0: `F_ALLOW_FALLBACK` (if gateway set fails, try next matching rule)
- bit 1: `F_CACHE_OK` (routers may cache gateway choice for ttl policy)
- others: reserved (0)

---

## 8. Matching & Resolution Semantics

Given a requested full name `child` and known `parent` (by configuration
or by walking labels):

1. Verify `GatewayRoutesV1` signature and check `g_exp`.
2. Extract `child_labels` that are **left of** the parent labels.
   - Example: `api.svc.example` under parent `example` =>
     `child_labels = ["api","svc"]`
3. For each rule in canonical order:
   - rule matches if:
     - `pattern_len == len(child_labels)`
     - each label matches EXACT bytes or WILDCARD
4. Choose the rule with:
   - lowest `priority`, then first in canonical order if tied
5. Use `gateway_set_id` to select gateway targets.

**Default behavior:** If no rule matches, delegation does not apply.

---

## 9. Signature Rules

### 9.1 Signing payload

Sign the canonical bytes from `magic` through `owner_pub` inclusive, excluding `sig`.

payload = encode_gatewayroutes_without_sig(obj)
sig = ed25519_sign(owner_priv, payload)

### 9.2 Verification

Verification succeeds if:

- `magic == "GWRT"`
- `version == 1`
- signature verifies against `owner_pub`

---

## 10. Replay Protection & Validity

A GatewayRoutesV1 object is valid only if:

- `g_exp` is in the future (allow small skew)
- `g_seq` is >= last accepted `g_seq` for `parent_name_id` (policy;
  recommended strictly increasing)
- `gwset_count` and `rule_count` are within safe bounds (policy)

---

## 11. Recommended Limits (Implementation Guidance)

To keep router implementations safe:

- Max gateway sets: 32
- Max targets per set: 8
- Max rules: 128
- Max pattern_len: 4 (typical) (enforce as policy if needed)
- Max total object size: 16 KiB

These are not consensus rules unless enforced by registry/chain policy.

---

## 12. Relationship to Chain Commitments

On-chain stores only:

- `(g_seq, g_exp, gateway_routes_hash)` for `parent_name_id`

Clients/watchdogs:

- fetch GatewayRoutesV1 from network (or redundancy storage)
- verify signature and hash match the chain commitment
- apply rules when direct child RouteSets are missing/untrusted

---

## 13. Notes & Future Extensions

Possible v2 upgrades:

- suffix-only matching (e.g., `*.svc.*`) without fixed label count
- weighted target selection inside a gateway set
- signed "conflict proofs" for equivocation reporting
- compact label-length encoding if needed for ASIC optimization
