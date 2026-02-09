# Protocol: Cache-as-Witness + Quorum (v1)

This spec defines the off-chain receipt format and the on-chain aggregate/quorum interface for Design 3.

MVP rule: receipt verification is OFF-CHAIN (miners). On-chain stores only minimal aggregates + canonical route state.

## 1) Definitions

### Name normalization

Input: `name` (string).

1. `name_lc = name.toLowerCase()`
2. Require `.dns` suffix.
3. `label = name_lc.slice(0, -4)`
4. Label rules:
   - length 3..32
   - allowed: `a-z`, `0-9`, `-`
   - no leading `-`, no trailing `-`

### name_hash

```
name_hash = SHA256(UTF8(name_lc))
```

### Destination canonical encoding

Input: `dest` (string).

MVP canonicalization:

1. Trim whitespace.
2. Lowercase scheme.
3. For `https://` URLs:
   - lowercase host
   - remove default port `:443`

Then:

```
dest_hash = SHA256(UTF8(dest_canonical))
```

## 2) Receipt Format (v1)

Receipt fields:

- `version: u8 = 1`
- `name_hash: [u8;32]`
- `dest_hash: [u8;32]`
- `observed_at_unix: i64`
- `ttl_s: u32`
- `signature: [u8;64]` (ed25519)

Canonical signing bytes:

```
msg = SHA256(
  "DDNS_RECEIPT_V1" ||
  name_hash ||
  dest_hash ||
  LE64(observed_at_unix) ||
  LE32(ttl_s)
)
signature = ed25519_sign(wallet_sk, msg)
```

Validation rules (miner-side):

- signature must verify
- freshness: `now_unix - observed_at_unix <= max_age_secs`
- ttl caps enforced by policy (min/max)
- dedupe: for a given epoch/window, count at most one receipt per `(wallet_pubkey, name_hash)`

## 3) Epoch / Quorum

Epoch:

```
epoch_id = floor(current_slot / epoch_len_slots)
```

Threshold parameters:

- `min_receipts: u32`
- `min_stake_weight: u64`
- `freshness_window_slots: u64` (or seconds in MVP)

MVP quorum:

- allowlisted miners submit aggregates and finalize if thresholds are met.
- stake proofs are not verified on-chain in MVP; roots are stored for future upgrades.

## 4) Aggregation (Miner)

Grouping key:

```
(epoch_id, name_hash, dest_hash)
```

Aggregate fields:

- `receipt_count: u32` (after dedupe)
- `stake_weight: u64` (sum of stake of distinct wallets included; MVP can treat unstaked wallets as 0 weight)
- `receipts_root: [u8;32]` (Merkle root committing to receipts)

Merkle root:

1. Leaf:
   - `leaf = SHA256(wallet_pubkey || name_hash || dest_hash || LE64(observed_at_unix) || LE32(ttl_s) || signature)`
2. Sort leaves lexicographically by leaf bytes.
3. Build a binary Merkle tree (duplicate last leaf if odd).

On-chain in MVP:

- only store the aggregate commitment (counts, weight, roots), not full receipts.

## 5) Finalization Rules

Canonical route changes only if quorum is achieved for a candidate `(name_hash, dest_hash, ttl_s)` within a freshness window.

Eligibility:

- `receipt_count >= min_receipts`
- `stake_weight >= min_stake_weight`
- aggregate is fresh (epoch/window timing rules)

Tie-break (if multiple candidates qualify):

1. highest `stake_weight`
2. then highest `receipt_count`
3. then most recent submission
4. then lowest `dest_hash` (deterministic final tie-break)

## 6) Cache Update Algorithm (Client)

Client cache entry:

- `dest_canonical`, `dest_hash`
- `ttl_s`, `expires_at_unix`
- `version` (canonical version observed)
- `proof` (canonical PDA address + account data + slot)

Algorithm:

1. If cache hit and not expired: return cached dest.
2. If miss/expired: query gateway/tollbooth for an answer.
3. Verify against chain (canonical route PDA).
4. Store cache (TTL capped; prefer stale-while-revalidate).
5. Emit receipt after successful verification (if eligible).

If canonical differs from local cache:

- keep last-known-good as active
- store new answer as pending
- promote pending only after chain shows the new canonical version

