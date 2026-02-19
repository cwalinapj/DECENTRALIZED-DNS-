# PROTOCOL_CACHE_LOG_V1

Status: MVP

This spec defines privacy-safe cache observations for premium `.dns` domains and how they are rolled up chronologically.

## CacheEntryV1

Domain separation for signatures:
- `DDNS_CACHE_ENTRY_V1`

Fields:
- `version: u8` (must be `1`)
- `name_hash: [32]` (`sha256(normalized_fqdn)`)
- `parent_name_hash: [32]` (`sha256(normalized_parent)` where parent is premium second-level like `acme.dns`)
- `rrset_hash: [32]` (normalized RRset hash, or canonical `dest_hash` when RRset bytes are unavailable)
- `ttl_s: u32`
- `confidence_bps: u16` (`0..10000`)
- `observed_bucket: u64` (`floor(unix/600)*600`)
- `witness_pubkey: [32]` (ed25519 public key)
- `signature: [64]` (ed25519 over canonical bytes)

Canonical signing bytes:
- `SHA256("DDNS_CACHE_ENTRY_V1" || version || name_hash || parent_name_hash || rrset_hash || ttl_s_le || confidence_bps_le || observed_bucket_le || witness_pubkey)`

## Hard privacy rules

Never include:
- client IP
- user-agent
- MAC/device identifiers
- wallet pubkey of end users
- per-user request IDs

Allowed payload is RRset-only observation facts.

## Chronological rollup

Entries are grouped by `parent_name_hash` and sorted by:
1. `observed_bucket` ascending
2. `name_hash` lexicographic
3. `rrset_hash` lexicographic

### Entry hash
- `entry_hash = SHA256(canonical_json(entry_without_signature_ordering))`

### Chunking
- A chunk contains up to `N` entries (MVP default `N=1024`)
- `chunk_root` is Merkle root over `entry_hash` leaves (sorted input order)

### Cache root
- `cache_root = SHA256(parent_name_hash || epoch_id_le || chunk_root_0 || ... || chunk_root_n)`

### IPFS publication
- Rollup payload (JSON) is uploaded to IPFS.
- `cid_hash = sha256(cid_utf8)` is stored on-chain.

## On-chain head

Program `ddns_cache_head` stores per-parent head:
- `cache_root`
- `cid_hash`
- `updated_at_slot`
- `epoch_id`
- `enabled`

MVP update authority is the parent owner.

## Contributor REP (MVP)

Accepted entries contribute to non-transferable REP via `ddns_rep`:
- base points per accepted entry
- confidence multiplier (high > medium > low)
- diversity bonus by unique subdomains and source diversity

REP is score-only (no transfer).
