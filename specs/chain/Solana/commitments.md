# 6. Solana / SVM Profile (Anchor-Compatible)

This section defines a recommended account model and instruction set for
storing commitments on Solana/SVM chains using **Anchor**.

## 6.1 Storage Model

On Solana, commitments are stored in accounts. Each `name_id` maps to a
PDA (program-derived address) that holds the latest commitment.

### 6.1.1 PDA Derivation

- Seeds:
  - `b"ddns_commitment"`
  - `ns_id` as 4 bytes little-endian
  - `name_id` (32 bytes)

PDA:
commitment_pda = PDA( seeds=[ "ddns_commitment", LE32(ns_id),
  name_id ], program_id )

### 6.1.2 Commitment Account Layout

Recommended fields:

- `ns_id` (u32)
- `name_id` ([u8; 32])
- `seq` (u64)
- `exp` (u64) unix seconds
- `routeset_hash` ([u8; 32])
- `owner` (Pubkey)

Optional delegation fields (either inline or in a separate PDA; see §6.4):

- `g_seq` (u64)
- `g_exp` (u64)
- `gateway_routes_hash` ([u8; 32])

## 6.2 Authorization Models (Solana)

### Model A (recommended v1): Account owner controls updates

- `owner` stored in the commitment account (a Solana Pubkey).
- Updates require `owner` to sign the transaction.

This avoids any on-chain Ed25519 verification complexity (Solana already
uses Ed25519 signatures for transaction auth).

## 6.3 Instructions (Recommended)

### 6.3.1 Initialize Commitment

Creates the PDA account for a `(ns_id, name_id)` pair.

Inputs:

- `ns_id`, `name_id`
- `owner` (signer)

Rules:

- PDA must not already exist
- set `owner`
- initialize seq/exp/hash
