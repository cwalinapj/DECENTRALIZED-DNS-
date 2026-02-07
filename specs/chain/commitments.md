# Chain Commitments (Minimal)

**Status:** Draft  
**Purpose:** Define the minimal on-chain commitment required to secure DECENTRALIZED-DNS updates while keeping chain storage and fees low.

The chain stores only:

- ordering/freshness metadata (`seq`, `exp`)
- a cryptographic commitment (`routeset_hash`)

All heavy data (records, signatures, routing/caching state) stays off-chain.

---

## 1. Core Model (Chain-Agnostic)

For each `name_id` (32 bytes), store:

- `seq` (u64): latest accepted sequence number
- `exp` (u64): expiry unix seconds
- `routeset_hash` (32 bytes): `BLAKE3_256(RouteSetV1_bytes_including_sig)`

**Mapping:**

name_id -> (seq, exp, routeset_hash)

---

## 2. Anchor-Only IPFS Relationship

- IPFS (redundancy) SHOULD store **AnchorV1 only**, not full RouteSets.
- AnchorV1 contains `routeset_hash` and is used to detect tampering when:
  - edge caches are compromised, or
  - watchdogs/validators are compromised, or
  - bootstrap needs a redundant reference.

Chain commitments remain the primary source of "latest hash".

---

## 3. Update Rules (Chain-Agnostic)

A valid update MUST satisfy:

- `new_seq > old_seq` (recommended strict)
- `new_exp > now`
- `routeset_hash` is 32 bytes
- authorization is enforced by the chain's ownership model (account-owned or pubkey-owned)

---

## 4. EVM Profile (Solidity-Compatible)

This section defines a recommended minimal contract interface for EVM chains.

### 4.1 Storage

```solidity
struct Commitment {
    uint64 seq;
    uint64 exp;
    bytes32 routesetHash;
}
mapping(bytes32 => Commitment) public commitments;
mapping(bytes32 => address) public ownerOf;

Required checks:
 • require(msg.sender == ownerOf[nameId])
 • require(newSeq > commitments[nameId].seq)
 • require(newExp > block.timestamp)
 • store (newSeq, newExp, newRoutesetHash)

4.3 Events

event CommitmentUpdated(
    bytes32 indexed nameId,
    uint64 seq,
    uint64 exp,
    bytes32 routesetHash
);

event OwnerChanged(
    bytes32 indexed nameId,
    address indexed newOwner
);
4.4 Notes
 • Contracts do not compute BLAKE3; they only store the provided routesetHash.
 • Clients/watchdogs compute BLAKE3 off-chain and compare.
 • Off-chain verification MUST also verify RouteSetV1 Ed25519 signatures.

⸻

5. Client/Resolver Verification (Off-chain)

Given a query for (ns_id, name):
 1. normalize and derive name_id per NameNormalization.md
 2. read chain commitment (seq, exp, routeset_hash)
 3. fetch RouteSetV1 from decentralized network/cache
 4. verify:
 • RouteSet name_id matches
 • RouteSet seq == chain.seq
 • RouteSet exp == chain.exp (recommended strict match)
 • BLAKE3(RouteSet_bytes_including_sig) == chain.routeset_hash
 • RouteSet Ed25519 signature verifies
 5. optionally fetch AnchorV1 from IPFS and ensure it matches (routeset_hash), as redundancy

If any check fails:
 • treat data as untrusted
 • refetch from multiple peers
 • record incident (watchdogs)

---

If you want, I can also generate a **`specs/records/RouteSetV1.md` "diff checklist"** that tells you exactly what to add/align in your existing file so all five specs are consistent (e.g., ensure RouteSet hash definition matches the one used in Anchor + commitments).
