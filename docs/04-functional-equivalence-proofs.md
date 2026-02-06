# Functional Equivalence Proofs (Correctness vs Centralized Reference)

TollDNS will integrate many decentralized protocols and established networks. To safely switch between them and centralized fallbacks, the network must define:

1) **What “correct behavior” means** (functionally), and  
2) **How to verify equivalence** between a decentralized backend and a centralized reference.

This document describes a pragmatic approach to “functional equivalence” using cryptographic attestations and conformance profiles.

---

## Important Constraint

It is not generally feasible to prove “this entire decentralized protocol behaves exactly like a centralized DNS provider for all possible inputs.”

Instead, TollDNS defines equivalence for a **bounded conformance surface**:
- specific query types
- specific resolution rules
- specific namespaces
- and specific invariants (e.g., DNSSEC validity, content pointer validity)

This is sufficient to automate safe fallback decisions while remaining auditable.

---

## Conformance Profiles

Each backend has a **Conformance Profile** registered on-chain (or referenced immutably). The profile defines:

- Supported request classes (qtypes, namespaces)
- Canonicalization rules (CNAME chasing, normalization, truncation rules)
- Validation rules (DNSSEC required? signature checks? content hash format?)
- Output expectations (RRset structure, TTL bounds, error semantics)
- Reference model used (quorum reference, deterministic algorithm, etc.)

Examples:
- `ICANN_DNS_PROFILE_V1`
- `ENS_PROFILE_V1`
- `SNS_SOL_PROFILE_V1`
- `IPFS_GATEWAY_PROFILE_V1`

---

## Reference Behavior (Function, Not Price)

Your requirement: “match centralized service by function, not price.”

So the “reference” is:
- what answers are returned,
- what error semantics are used,
- what validation rules apply,
not how much it costs.

References can be:
- an upstream DNS quorum (N-of-M agreement) for non-DNSSEC
- deterministic resolution rules (for name-to-record lookups)
- signature validation rules (for signed records/content pointers)

---

## Equivalence Checks (Three Tiers)

### Tier 1 — Quorum-Signed Conformance Attestations (Fastest to ship)
Verifiers periodically run challenge sets:
- `challenge_set_id`
- list of queries (qname/qtype/namespace)
- expected invariants (not always a single exact answer)
- result: PASS/FAIL + summary

A quorum of verifiers signs:
- “Backend X satisfies Conformance Profile Y for Window W.”

This is cryptographically verifiable (signatures), and the on-chain policy can use it to trigger fallback.

**Pros:** implementable early, strong enough for automated switching.  
**Cons:** relies on verifier honesty (mitigated by diversity, staking, auditability).

---

### Tier 2 — Trusted Execution Environment (TEE) Attestations (Stronger, still practical)
Verifiers run conformance checks inside TEEs, producing attestations that:
- the verifier ran approved code (hash)
- the code executed challenge set checks
- the output was PASS/FAIL

**Pros:** reduces trust in verifiers.  
**Cons:** depends on TEE security assumptions and supply chain.

---

### Tier 3 — ZK Proofs of Execution (Most rigorous, narrowest scope)
For narrow deterministic adapters, produce ZK proofs that:
- given input `I`, adapter logic `F` outputs `O`,
- and `O` satisfies conformance invariants.

This is realistic for small pure functions (e.g., parsing a record, validating a signature, mapping a contenthash → gateway format), not for “full internet recursion.”

**Pros:** strongest correctness claim.  
**Cons:** expensive and limited to narrow components.

---

## Challenge Sets

Challenge sets are curated and updated:
- include “hot” names and randomized samples
- include adversarial edge cases
- include known attack patterns (NXDOMAIN floods, weird records, etc.)
- avoid storing sensitive user queries

Challenge sets should be content-addressed:
- published as `CID` / hash
- referenced in attestations as `challenge_set_id`

---

## What Gets Proven (Examples)

### Standard DNS (ICANN)
Equivalence can be expressed as:
- DNSSEC validity when applicable
- agreement with upstream quorum on non-DNSSEC domains
- correct error semantics (NXDOMAIN/NODATA)
- consistent CNAME chasing semantics

### Web3 Names (ENS/SNS/Unstoppable)
Equivalence can be:
- correct record retrieval from the chain state
- correct signature/ownership verification rules
- correct mapping to DNS outputs (RRs) or gateway targets

### Content Networks (IPFS/Filecoin/Arweave)
Equivalence can be:
- retrieved content matches content hash (CID integrity)
- gateway responses reflect correct content addressing semantics
- retry/fallback behavior follows policy

---

## Using Equivalence in Automatic Fallback

The watchdog policy triggers fallback when:
- conformance fails for consecutive windows, OR
- success rate drops below threshold, OR
- cryptographic invariants break (hard fail)

On recovery:
- require sustained conformance passing
- ramp traffic back gradually

---

## Immutable Program Pointers (NFT / Registry Option)

Each backend can be represented by an immutable pointer object (NFT-like or registry record) that references:
- adapter spec hash
- conformance profile hash
- policy thresholds hash
- verifier set id
- fallback mapping

This enables transparent, auditable evolution:
- new versions can be added as new pointer objects
- old versions remain immutable and reviewable

---

## Summary

Functional equivalence is enforced by:
- defining a bounded conformance surface,
- continuously attesting equivalence with cryptographic signatures (and optionally TEEs/ZK),
- and using immutable on-chain policy to trigger automatic fallback.

This provides safety without requiring impossible “prove the whole internet” guarantees.
