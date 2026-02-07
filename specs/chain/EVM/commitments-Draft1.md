# Chain Commitments

**Status:** Draft  
**Purpose:** Define the minimal on-chain commitment required to secure DECENTRALIZED-DNS updates while keeping chain storage and gas/fees low.

This document includes a chain-agnostic model and an **EVM implementation profile**.

---

## 1. Design Goals

- **Minimal on-chain footprint**
- **Replay protection** (monotonic sequence)
- **Freshness** (expiry)
- **Tamper detection** (commitment to RouteSet via hash)
- Optional: commit to delegation/gateway rules by hash (see GatewayRoutesV1)

---

## 2. Minimal Commitment (Chain-Agnostic)

For each `name_id` (bytes32), store:

- `seq` (u64): latest accepted sequence number
- `exp` (u64): expiry unix seconds
- `routeset_hash` (bytes32): `BLAKE3_256(RouteSetV1_bytes_including_sig)`

**Mapping:**

name_id -> (seq, exp, routeset_hash)

Clients resolve by:

1) reading the chain commitment
2) fetching RouteSet from decentralized network/cache
3) verifying hash and signature

---

## 3. Optional: GatewayRoutes Commitment (Chain-Agnostic)

For each `name_id`, optionally store:

- `g_seq` (u64)
- `g_exp` (u64)
- `gateway_routes_hash` (bytes32): commitment to `GatewayRoutesV1` bytes including sig

**Extended mapping:**
name_id -> (seq, exp, routeset_hash, g_seq?, g_exp?, gateway_routes_hash?)

See `specs/records/GatewayRoutesV1.md`.

---

## 4. Update Rules (Chain-Agnostic)

A valid update MUST satisfy:

- `new_seq > old_seq` (recommended strict)
- `new_exp > now`
- authorization per the chain's ownership model (account-owned or pubkey-owned)

Delegation update MUST satisfy:

- `new_g_seq > old_g_seq`
- `new_g_exp > now`

---

## 5. EVM Profile (Solidity-Compatible)

This section defines recommended storage types, function shapes, and events for Ethereum/EVM chains.

## 5.1 Storage Layout

Use `bytes32` for `name_id` and `routeset_hash`.

Solidity does not have native `u64` in storage packing the same way as Rust, but `uint64` is supported.

Recommended struct:

```solidity
struct Commitment {
    uint64 seq;
    uint64 exp;
    bytes32 routesetHash;
    // Optional delegation:
    uint64 gSeq;
    uint64 gExp;
    bytes32 gatewayRoutesHash;
}
mapping(bytes32 => Commitment) public commitments;

5.2 Ownership / Authorization Models (EVM)

Pick one (or support both):

Model A: EVM account owns name_id
 • Maintain mapping(bytes32 => address) ownerOf;
 • Only ownerOf[name_id] may update commitments.

Model B: Owner is an Ed25519 pubkey (off-chain verified)
 • Store owner_pubkey_hash or pubkey bytes in contract.
 • Updates still come from an EVM tx sender, but must include proof.
 • This is more complex because EVM does not natively verify Ed25519.

Recommendation for v1: Model A (EVM account ownership) for simplicity.

5.3 Update Functions (Recommended)

5.3.1 Update RouteSet commitment
function setCommitment(
    bytes32 nameId,
    uint64 newSeq,
    uint64 newExp,
    bytes32 newRoutesetHash
) external;

Rules:
 • require msg.sender == ownerOf[nameId]
 • require newSeq > commitments[nameId].seq
 • require newExp > block.timestamp
 • set fields

5.3.2 Update GatewayRoutes commitment 

function setDelegation(
    bytes32 nameId,
    uint64 newGSeq,
    uint64 newGExp,
    bytes32 newGatewayRoutesHash
) external;

Rules:
 • require msg.sender == ownerOf[nameId]
 • require newGSeq > delegations[nameId].gSeq
 • require newGExp > block.timestamp

5.4 Events 

Emit events for indexers/watchdogs:
event CommitmentUpdated(
    bytes32 indexed nameId,
    uint64 seq,
    uint64 exp,
    bytes32 routesetHash
);

event DelegationUpdated(
    bytes32 indexed nameId,
    uint64 gSeq,
    uint64 gExp,
    bytes32 gatewayRoutesHash
);

event OwnerChanged(
    bytes32 indexed nameId,
    address indexed newOwner
);

5.5 Indexing Notes

Indexers/watchdogs should:
 • treat the latest finalized block state as canonical
 • detect equivocation off-chain (if multiple RouteSets claim same seq but different hash, that's a network incident)
 • verify that served RouteSets match the on-chain hash

5.6 Hash Algorithm Note (EVM)

EVM contracts cannot efficiently compute BLAKE3. The contract does not compute it; it only stores routesetHash values provided by the updater.

Clients/watchdogs compute BLAKE3 off-chain and compare.

5.7 Time & Expiry

Use block.timestamp as the reference for expiry checks on-chain.

Off-chain verifiers should allow small skew, but on-chain rules are strict:
 • newExp > block.timestamp
---

If you want the repo to be extra consistent, I can also provide **`specs/chain/namespaces.md`** (ns_id allocations) and a short **`specs/chain/evm-contract-interface.md`** that mirrors the ABI cleanly for SDK implementers.
