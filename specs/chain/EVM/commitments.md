# EVM Commitments Specification

**Status:** Draft  
**Scope:** Ethereum / EVM chains (Solidity-compatible)

This document specifies how DECENTRALIZED-DNS commitments are stored and updated on EVM chains.

---

## 1. Commitment Model

For each `name_id` (bytes32), store:

- `seq` (uint64)
- `exp` (uint64) unix seconds
- `routeset_hash` (bytes32)

Optional delegation:
- `g_seq` (uint64)
- `g_exp` (uint64)
- `gateway_routes_hash` (bytes32)

---

## 2. Storage Layout

### 2.1 Minimal commitment (recommended)
```solidity
struct Commitment {
    uint64 seq;
    uint64 exp;
    bytes32 routesetHash;
}
mapping(bytes32 => Commitment) public commitments;

2.2 Optional delegation (Seperate Mapping)

Keeping delegation separate avoids paying storage for names that don’t use it.

struct Delegation {
    uint64 gSeq;
    uint64 gExp;
    bytes32 gatewayRoutesHash;
}
mapping(bytes32 => Delegation) public delegations;

3. Ownership / Authorization

Recommended v1: EVM account ownership.

mapping(bytes32 => address) public ownerOf;

mapping(bytes32 => address) public ownerOf;mapping(bytes32 => address) public ownerOf;

Rules:
	•	only ownerOf[nameId] may update commitments/delegations
	•	ownership transfer is an on-chain operation

Note: EVM contracts do not efficiently verify Ed25519. RouteSet/Anchor signatures are verified off-chain by resolvers/watchdogs.

4. Update Functions (ABI Shape)

4.1 Set RouteSet commitment

function setCommitment(
    bytes32 nameId,
    uint64 newSeq,
    uint64 newExp,
    bytes32 newRoutesetHash
) external;

Required checks:
	•	require(msg.sender == ownerOf[nameId])
	•	require(newSeq > commitments[nameId].seq)
	•	require(newExp > block.timestamp)
	•	update storage

4.2 Set delegation commitment (Optional)
function setDelegation(
    bytes32 nameId,
    uint64 newGSeq,
    uint64 newGExp,
    bytes32 newGatewayRoutesHash
) external;

Required checks:
	•	require(msg.sender == ownerOf[nameId])
	•	require(newGSeq > delegations[nameId].gSeq)
	•	require(newGExp > block.timestamp)
	•	update storage

Client/Resolver Verification (Off-chain)

Given (name_id):
	1.	Read commitments[name_id] from chain
	2.	Fetch RouteSetV1 from decentralized network/cache
	3.	Verify:

	•	RouteSet.name_id == name_id
	•	RouteSet.seq == chain.seq
	•	RouteSet.exp == chain.exp (recommended strict match)
	•	BLAKE3(RouteSet_bytes_including_sig) == chain.routeset_hash
	•	Ed25519 signature of RouteSet verifies (per RouteSetV1 spec)

Delegation (if used):
	•	Fetch GatewayRoutesV1, verify hash == delegations[name_id].gateway_routes_hash and signature

⸻

7. Minimal Chain Storage Note

The contract stores only commitments (hashes + seq/exp).
Full records and signatures remain off-chain (routers/edge caches + optional AnchorV1 in IPFS).

---

## `specs/chain/Solana/commitments.md`

```md
# Solana Commitments Specification

**Status:** Draft  
**Scope:** Solana / SVM chains using Anchor (Rust)

This document specifies how DECENTRALIZED-DNS commitments are stored and updated on Solana.

---

## 1. Commitment Model

For each `(ns_id, name_id)` pair, store:

- `ns_id` (u32)
- `name_id` ([u8; 32])
- `seq` (u64)
- `exp` (u64) unix seconds
- `routeset_hash` ([u8; 32])
- `owner` (Pubkey)

Optional delegation:
- `g_seq` (u64)
- `g_exp` (u64)
- `gateway_routes_hash` ([u8; 32])

---

## 2. PDA Derivation

Commitment accounts are PDAs derived as:

Seeds:
- `b"ddns_commitment"`
- `ns_id` as 4 bytes little-endian
- `name_id` (32 bytes)

PDA:
commitment_pda = Pubkey::find_program_address(
[b”ddns_commitment”, LE32(ns_id), name_id],
program_id
)

If using delegation as a separate account, recommended seeds:
- `b"ddns_delegation"`
- `ns_id` (LE32)
- `name_id`

---

## 3. Account Layouts (Anchor)

### 3.1 Commitment account
Recommended Anchor struct:

```rust
#[account]
pub struct Commitment {
    pub ns_id: u32,
    pub name_id: [u8; 32],
    pub seq: u64,
    pub exp: u64,
    pub routeset_hash: [u8; 32],
    pub owner: Pubkey,
}

3.2 Optional delegation account (recommended separate)

#[account]
pub struct Delegation {
    pub ns_id: u32,
    pub name_id: [u8; 32],
    pub g_seq: u64,
    pub g_exp: u64,
    pub gateway_routes_hash: [u8; 32],
    pub owner: Pubkey,
}

4. Authorization Model

Recommended v1: Solana owner (Pubkey) signs the transaction.
	•	The owner field is stored in the Commitment (and Delegation, if separate).
	•	Updates require owner as a Signer.

This avoids on-chain Ed25519 verification (Solana transaction auth already uses Ed25519).

⸻

5. Instructions (Recommended)

5.1 initialize_commitment

Creates the Commitment PDA for (ns_id, name_id).

Rules:
	•	account must not exist
	•	payer funds rent
	•	set owner
	•	initialize seq/exp/routeset_hash to 0 (or allow initial set in same instruction)

5.2 set_commitment

Updates (seq, exp, routeset_hash).

Required checks:
	•	owner must sign
	•	new_seq > commitment.seq
	•	new_exp > now_unix_seconds

5.3 initialize_delegation (optional)

Creates Delegation PDA.

5.4 set_delegation (optional)

Updates (g_seq, g_exp, gateway_routes_hash).

Required checks:
	•	owner must sign
	•	new_g_seq > delegation.g_seq
	•	new_g_exp > now_unix_seconds

⸻

6. Time Source

Use Solana Clock sysvar:
	•	Clock::get()?.unix_timestamp (cast to u64 with appropriate checks)

⸻

7. Client/Resolver Verification (Off-chain)

Same logic as EVM, except:
	•	the on-chain commitment is read from Solana accounts
	•	signature verification remains off-chain:
	•	verify RouteSetV1 Ed25519 sig
	•	verify hashes match on-chain stored values

⸻

8. Minimal Storage Note

Solana stores only commitments (hashes + seq/exp + owner).
Full records remain in your decentralized network/cache, with optional AnchorV1 in IPFS as redundancy.

---

If you want, I can also give you:
- `specs/chain/EVM/abi.md` (exact ABI + calldata types)
- `specs/chain/Solana/anchor-accounts.md` (exact PDA seeds + account sizes + discriminator notes)
