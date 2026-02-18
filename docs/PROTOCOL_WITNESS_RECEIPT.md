# Protocol: WitnessReceiptV1 (Privacy-Safe DNS Answer Witnessing)

This spec defines **WitnessReceiptV1**, an off-chain, gateway-signed receipt that attests to an observed DNS answer for a name at a coarse time bucket. It is designed to be:

- censorship-resistant (many independent witnesses can emit)
- auditable (hashes are deterministic)
- privacy-safe (no user identifiers, no IPs, no per-user IDs)

This is MVP: receipts are verified **off-chain** (miners/verifiers). On-chain can later store aggregate commitments.

## 1) Terminology

- **Witness**: a gateway/NS operator that resolves names and signs receipts with a dedicated keypair.
- **Name**: either a `.dns` name (e.g. `alice.dns`) or an ICANN fqdn (e.g. `example.com`).
- **RRSet**: the DNS answer bytes (canonicalized) or a route-model hash (e.g. `dest_hash`).

## 2) Name Normalization

Normalization MUST be deterministic. For MVP, use ASCII lowercasing only.

### 2.1 `.dns` names

Input: `name` string.

1. `name_norm = trim(name).toLowerCase()`
2. Require suffix `.dns`
3. Label rules on the part before `.dns`:
   - length 3..32
   - allowed chars: `a-z`, `0-9`, `-`
   - no leading `-`, no trailing `-`

### 2.2 ICANN fqdn (MVP)

Input: `fqdn` string.

1. `name_norm = trim(fqdn).toLowerCase()`
2. Strip a single trailing dot `.` if present
3. Length 1..253

Note: punycode handling is a future upgrade. MVP assumes ASCII domain input.

## 3) Hashes

### 3.1 name_hash

```
name_hash = SHA256(UTF8(name_norm))
```

### 3.2 rrset_hash

Two compatible interpretations:

1. **DNS bytes model**: `rrset_hash = SHA256(canonical_dns_answer_bytes)`
2. **Route model (MVP)**: if the system is `name_hash -> dest_hash`:
   - set `rrset_hash = dest_hash = SHA256(UTF8(dest_canonical))`

MVP recommendation: use the route model (`dest_hash`) so clients do not need raw DNS RRSet bytes.

## 4) Time Bucketing (Privacy)

To reduce tracking risk, `observed_at_unix` MUST be bucketed.

Bucket size: 10 minutes (600 seconds).

```
observed_at_bucket = floor(observed_at_unix / 600) * 600
```

## 5) WitnessReceiptV1 Format

Fields:

- `version: u8 = 1`
- `name: string` (original input; must normalize deterministically)
- `name_hash: [32]` (sha256 of normalized name)
- `rrset_hash: [32]` (sha256 of canonical answer model; typically dest_hash in MVP)
- `ttl_s: u32`
- `observed_at_bucket: i64` (bucketed unix seconds)
- `witness_pubkey: Pubkey`
- `signature: [64]` (ed25519)

JSON encoding (recommended for services):

- `name_hash`: 32-byte hex (64 hex chars, optional `0x` prefix)
- `rrset_hash`: 32-byte hex (64 hex chars, optional `0x` prefix)
- `signature`: base64 of the 64-byte ed25519 signature

Canonical signing bytes:

```
msg = SHA256(
  "DDNS_WITNESS_V1" ||
  name_hash ||
  rrset_hash ||
  LE32(ttl_s) ||
  LE64(observed_at_bucket)
)
signature = ed25519_sign(witness_sk, msg)
```

## 6) Validation Rules (Miner-side, MVP)

- Receipt `version` must be `1`
- `name_hash` must equal `SHA256(name_norm)`
- `observed_at_bucket` must be a multiple of 600
- `signature` must verify against `witness_pubkey`
- Freshness window: reject if `now_unix - observed_at_bucket > 24h` (configurable)

## 7) Privacy Rules (Hard Requirements)

- Receipts MUST NOT include:
  - client IP
  - user agent
  - wallet pubkeys
  - per-request IDs
- Gateways MUST NOT log client IPs for receipt issuance (disable default request logs or redact).
