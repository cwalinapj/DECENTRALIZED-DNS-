# Functional Equivalence Proofs (What “Correct” Means)

This document defines how TollDNS determines that different resolution backends are functionally equivalent and therefore safe to route interchangeably.

## Why Equivalence Is Needed

Backends may derive answers from different sources (ICANN recursion, chain-based name systems, content-addressed storage). To keep routing safe, the protocol needs a shared definition of correctness for each backend type.

## Conformance Profiles

Each backend registry entry references a `conformance_profile_id` that specifies:

- expected data source and trust anchors
- validation steps (DNSSEC proof, chain proof, content hash match)
- allowed normalization (TTL bounds, ordering, canonical encoding)
- acceptable error classes and timeouts
- caching rules and refresh behavior

## Equivalence Rules

Equivalence rules define how answers are compared across backends:

- normalize record ordering and TTL ranges
- allow approved alias/redirect mappings
- require cryptographic proofs for signed data
- treat mismatched ownernames or hash mismatches as failures

## Proof Artifacts

Backends or verifiers can attach proof artifacts to conformance checks, such as:

- DNSSEC validation chains
- blockchain state proofs or signed checkpoints
- content hash commitments (CID, Filecoin CID, Arweave txid)

These artifacts inform health reports and policy enforcement.

## Policy Integration

The `policy_id` combines watchdog thresholds with equivalence rules. Conformance failures can trigger state transitions as defined in `docs/03-watchdogs-and-fallback.md`.
