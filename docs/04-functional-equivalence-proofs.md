# 04 — Functional Equivalence Proofs (Correctness vs Centralized Reference)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

TollDNS integrates multiple networks and protocols (e.g., IPFS/Filecoin/Arweave, ENS, SNS, Handshake, PKDNS/PKARR). To safely switch between them and centralized fallbacks, the network defines:

1) **What “correct behavior” means** (functionally), and  
2) **How to verify equivalence** between a decentralized backend and a reference behavior.

This document describes a pragmatic approach to “functional equivalence” using bounded conformance profiles and cryptographically verifiable attestations.

---

## Important Constraint

It is not generally feasible to prove “this entire decentralized protocol behaves exactly like a centralized DNS provider for all possible inputs.”

Instead, TollDNS defines equivalence for a **bounded conformance surface**:

- specific query types and namespaces
- specific resolution rules and invariants
- specific output semantics (RRsets, TTL bounds, error semantics)

This is sufficient to automate safe fallback decisions while remaining auditable.

---

## What “Reference Behavior” Means (Function, Not Price)

Your requirement: the decentralized backend must match the centralized service **by function**, not by price.

So the “reference” is:

- what answers are returned (within defined semantics)
- what error semantics are used (NXDOMAIN vs NODATA, etc.)
- what validation rules apply (DNSSEC, signature checks, content hash checks)
- what canonicalization rules apply (CNAME chasing, normalization, etc.)

not:

- who is cheaper
- who is faster (performance is handled separately by health checks)

---

## Conformance Profiles

Each backend has a **Conformance Profile** registered on-chain (or referenced immutably by content hash). The profile defines:

- Supported request classes:
  - qtypes, namespaces, protocol features
- Canonicalization rules:
  - normalization, CNAME chasing limits, truncation rules for DoH responses, etc.
- Validation rules:
  - DNSSEC requirements (if applicable)
  - signature rules for records/pointers
  - CID/content addressing validity rules
- Output expectations:
  - RRset shape, TTL bounds, error semantics
- Reference model:
  - upstream quorum reference, deterministic algorithm, or signature-validity model

Examples:

- `ICANN_DNS_PROFILE_V1`
- `ENS_PROFILE_V1` (ENS: <https://github.com/ensdomains>)
- `SNS_SOL_PROFILE_V1` (Bonfida/SNS: <https://github.com/Bonfida> and <https://github.com/SolanaNameService/sns-sdk>)
- `UNSTOPPABLE_PROFILE_V1` (<https://github.com/unstoppabledomains/resolution>)
- `HANDSHAKE_PROFILE_V1` (<https://github.com/handshake-org> and <https://github.com/handshake-org/hnsd>)
- `PKDNS_PKARR_PROFILE_V1` (<https://github.com/pubky/pkdns> and <https://github.com/pubky/pkarr>)
- `IPFS_GATEWAY_PROFILE_V1` (IPFS: <https://github.com/ipfs>)
- `FILECOIN_RETRIEVAL_PROFILE_V1` (<https://github.com/filecoin-project>)
- `ARWEAVE_GATEWAY_PROFILE_V1` (<https://github.com/arweaveteam>)

---

## Equivalence Checks: Three Practical Tiers

TollDNS supports multiple strength levels of “proof” (you can start with Tier 1 and upgrade over time).

### Tier 1 — Quorum-Signed Conformance Attestations (Fastest to ship)

Verifiers periodically run challenge sets (see below) and sign a statement:

- `backend_id`
- `conformance_profile_id`
- `challenge_set_id`
- `window_id`
- `result` (PASS/FAIL/UNKNOWN)
- aggregated reason codes (e.g., wrong semantics, invalid signatures, timeout)
- verifier signature

The on-chain policy uses quorum rules to treat repeated FAIL as a trigger for `DEGRADED` or `DISABLED`.

**Pros**

- implementable early
- cryptographically verifiable signatures
- good enough for automated fallback

**Cons**

- relies on verifier honesty (mitigated by staking, diversity, auditability)

---

### Tier 2 — TEE Attestations (Stronger, still practical)

Verifiers run conformance checks inside a Trusted Execution Environment and publish attestations showing:

- an approved code hash ran
- challenge checks executed
- PASS/FAIL output produced

**Pros**

- reduces trust in verifiers (harder to lie about running the check)

**Cons**

- depends on the security model of the TEE platform

---

### Tier 3 — ZK Proofs of Execution (Most rigorous, narrowest scope)

For narrow deterministic functions, produce ZK proofs that:

- given input `I`, adapter logic `F` outputs `O`
- and `O` satisfies conformance invariants

This is realistic for:

- parsing and validation routines
- signature verification rules
- deterministic mapping functions (e.g., name record → RRset)
- content-hash → gateway mapping rules

It is generally not realistic for full internet recursion.

**Pros**

- strongest correctness claim

**Cons**

- expensive and limited to narrow components

---

## Challenge Sets (How We Test Behavior)

Challenge sets are curated and updated:

- include “hot” names and randomized samples
- include adversarial edge cases
- avoid sensitive user queries
- are content-addressed (CID / hash) for auditability

A challenge set can specify **invariants** rather than exact answers. Examples:

- “must validate DNSSEC if present”
- “must not return malformed RRsets”
- “must return NXDOMAIN vs NODATA correctly”
- “must resolve ENS contenthash to a valid CID format”
- “must return a deterministic mapping for SNS name record formats”
- “must return content matching CID for gateway fetches (integrity)”

---

## What We Can Prove (Examples)

### Standard DNS (ICANN)

Equivalence can be expressed as:

- DNSSEC validity when applicable
- agreement with upstream quorum for non-DNSSEC domains
- correct error semantics (NXDOMAIN/NODATA)
- correct CNAME chasing rules and limits

### Web3 Names (ENS/SNS/Unstoppable)

Equivalence can be expressed as:

- correct chain lookup semantics for the supported record surface
- correct ownership/verification rules
- correct mapping into DNS RR outputs and/or gateway targets

### Content Networks (IPFS/Filecoin/Arweave)

Equivalence can be expressed as:

- retrieved bytes match content hash (CID/integrity)
- correct gateway semantics (redirects, content-type rules, etc.) as defined by profile
- correct retry/fallback behavior under policy

---

## How Equivalence Drives Automatic Fallback

The watchdog policy triggers fallback when:

- conformance fails for consecutive windows, OR
- success rate drops below threshold, OR
- cryptographic invariants break (“hard fail”)

Recovery requires:

- sustained conformance passing
- sustained health passing
- gradual ramp-up (canary traffic)

See: `docs/03-watchdogs-and-fallback.md`

---

## Immutable Program Pointers (Registry / NFT Option)

Each backend can be represented by an immutable pointer object (NFT-like or registry record) referencing:

- adapter spec hash
- conformance profile hash
- watchdog policy thresholds hash
- verifier set id
- fallback mapping id

This enables transparent evolution:

- old versions remain immutable and reviewable
- new versions are added as new pointer objects
- switching rules remain governed and auditable

---

## Next Doc

- Tokenomics (escrow vs governance stake, payouts): `docs/05-tokenomics.md`
