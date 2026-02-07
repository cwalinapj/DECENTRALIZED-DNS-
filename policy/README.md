# Policy Contracts (Watchdogs → Routing Policy)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This folder specifies contracts that implement the **immutable policy state machine**:
- ingest Health Reports from verifiers,
- compute backend states (HEALTHY/DEGRADED/DISABLED/RECOVERING),
- publish routing weights/mode flags,
- and coordinate automatic fallback and (optional) Attack Mode.

Related:
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Policy state machine spec: `specs/policy-state-machine.md`
- Health report spec: `specs/health-report-format.md`

---

## Contracts in this Module

### 1) VerifierSetRegistry
Defines which verifiers are authorized to submit health reports for an epoch:
- verifier set id
- public keys
- region assignments (coarse)
- activation windows

**Purpose**
- prevent spoofed reports
- enable quorum diversity rules

---

### 2) HealthReportIngestor
Validates:
- signature correctness
- verifier membership
- window boundaries
- field sanity bounds

Then stores/tallies reports so the policy state machine can aggregate them.

**Purpose**
- keep reports verifiable and cheap
- protect policy contract from malformed data

---

### 3) PolicyStateMachine
Consumes tallied health reports each window and updates:
- backend state
- routing weights
- mode flags (CACHE_FIRST, CACHE_ONLY, QUORUM_MODE, ATTACK_MODE signal)
- fallback activation signals

**Purpose**
- deterministic circuit breaker
- auditable state transitions

---

### 4) RoutingPolicyRegistry
Stores current routing policy records for resolvers/edges:
- per-backend state, weight, flags, policy version
- global mode flags (optional)

**Purpose**
- a single authoritative place to read “what to do now”

---

## Required Invariants

- Only authorized verifiers can influence backend state.
- State transitions must obey the state machine rules (no ad-hoc jumps).
- DISABLED backends must not be routed except canary recovery probes (policy-controlled).
- All updates must emit events with coarse reason codes for auditability.

---

## Suggested Events

- `HealthReportAccepted(backend_id, window_id, verifier_id)`
- `HealthReportRejected(backend_id, window_id, verifier_id, reason)`
- `BackendStateChanged(backend_id, old_state, new_state, window_id, reason_codes)`
- `RoutingPolicyUpdated(backend_id, policy_version, weight, flags)`
- `AttackModeChanged(enabled, window_id, reason_codes)`
