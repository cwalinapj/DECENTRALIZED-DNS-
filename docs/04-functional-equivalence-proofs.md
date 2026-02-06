# Functional Equivalence Proofs (Correctness vs Centralized Reference)

**Repo home:** https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS integrates multiple networks and protocols (e.g., IPFS/Filecoin/Arweave, ENS, SNS, Handshake, PKDNS/PKARR). To safely switch between them and centralized fallbacks, the network defines:

1) **What “correct behavior” means** (functionally), and  
2) **How to verify equivalence** between a decentralized backend and a reference behavior.

Reference implementations and upstream projects (examples):
- ENS: https://github.com/ensdomains
- SNS / Bonfida: https://github.com/Bonfida and SDKs: https://github.com/SolanaNameService/sns-sdk
- Unstoppable Domains Resolution: https://github.com/unstoppabledomains/resolution
- Handshake hnsd: https://github.com/handshake-org/hnsd
- PKDNS / PKARR: https://github.com/pubky/pkdns and https://github.com/pubky/pkarr
- IPFS: https://github.com/ipfs
- Filecoin: https://github.com/filecoin-project
- Arweave: https://github.com/arweaveteam

---

## Important Constraint

It is not generally feasible to prove “this entire decentralized protocol behaves exactly like a centralized DNS provider for all possible inputs.”

Instead, TollDNS defines equivalence for a **bounded conformance surface**:
- specific query types
- specific resolution rules
- specific namespaces
- and specific invariants (e.g., DNSSEC validity, content pointer validity)

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
- `UNSTOPPABLE_PROFILE_V1`
- `PKDNS_PKARR_PROFILE_V1`
- `IPFS_GATEWAY_PROFILE_V1`

---

## Reference Behavior (Function, Not Price)

Your requirement is “match centralized service by function, not price.”

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

The on-chain policy can use this to trigger fallback.

---

### Tier 2 — TEE Attestations (Stronger, still practical)
Verifiers run conformance checks inside TEEs, producing attestations that:
- approved code hash ran,
- challenge checks executed,
- PASS/FAIL output produced.

---

### Tier 3 — ZK Proofs of Execution (Most rigorous, narrowest scope)
For narrow deterministic adapters, produce ZK proofs that:
- given input `I`, adapter logic `F` outputs `O`,
- and `O` satisfies conformance invariants.

This is realistic for small pure functions (parsing/validation/mapping), not full internet recursion.

---

## Challenge Sets

Challenge sets are curated and updated:
- include “hot” names and randomized samples
- include adversarial edge cases
- avoid storing sensitive user queries

Challenge sets should be content-addressed:
- published as `CID` / hash
- referenced in attestations as `challenge_set_id`

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

Old versions remain immutable and reviewable; new versions can be added as new pointer objects.
