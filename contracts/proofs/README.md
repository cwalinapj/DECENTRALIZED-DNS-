# Proofs Contracts (Conformance, Equivalence, and Audit Hooks)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This folder specifies how TollDNS can represent and verify “proof-like” artifacts on-chain:

- conformance PASS/FAIL attestations (Tier 1),
- optional TEE attestations (Tier 2),
- optional ZK proofs for narrow deterministic functions (Tier 3),
- and audit sampling hooks for receipts.

The system starts with Tier 1 (signed attestations) and can upgrade later.

Related:

- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Watchdogs: `docs/03-watchdogs-and-fallback.md`
- Receipt format: `specs/receipt-format.md`

---

## Contracts in this Module

### 1) ConformanceRegistry

Stores (or references) conformance profiles and challenge sets:

- profile id → immutable hash pointer
- challenge set id → content hash (CID) pointer
- allowed probe schedules and verifier sets

**Purpose**

- make “correctness expectations” explicit and immutable/auditable

---

### 2) ConformanceAttestationIngestor

Accepts signed conformance results from authorized verifiers:

- backend id
- conformance profile id
- challenge set id
- window id
- PASS/FAIL/UNKNOWN

**Purpose**

- supply the policy state machine with correctness signals
- enable automated disabling for conformance failures

---

### 3) ReceiptAuditHook (optional)

Enables audit sampling for batch receipts:

- request Merkle proofs for sampled leaves
- store audit results as coarse PASS/FAIL
- penalize repeated unverifiable receipts (policy-defined)

**Purpose**

- reduce fraud without per-request on-chain receipts

---

## Required Invariants

- Only authorized verifiers can submit conformance attestations.
- Conformance profile references must be immutable (hash/CID).
- Conformance results must be time-bucketed (window/epoch).
- Audit hooks must not leak raw user queries by default.

---

## Events (Examples)

- `ConformanceProfileRegistered(profile_id, hash)`
- `ChallengeSetRegistered(challenge_set_id, cid_hash)`
- `ConformanceAttested(backend_id, profile_id, window_id, result)`
- `ReceiptAuditRequested(epoch_id, operator_id, sample_id)`
- `ReceiptAuditResult(epoch_id, operator_id, sample_id, result)`
