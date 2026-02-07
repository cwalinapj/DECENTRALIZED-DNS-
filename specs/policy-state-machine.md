# Policy State Machine (Watchdogs → Routing Policy) — Spec

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This spec defines the **immutable policy state machine** that consumes verifier **Health Reports** and produces authoritative backend states and routing policy updates.

The policy state machine is the core mechanism that enables:
- automatic fallback to centralized services when needed,
- safe recovery back to decentralized backends,
- attack-mode escalation when multiple critical systems degrade,
- and auditable state transitions.

Normative unless stated otherwise.

Related docs/specs:
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Health report format: `specs/health-report-format.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Routing engine: `docs/07-routing-engine.md`

---

## 1. Goals

The policy state machine MUST:
- be deterministic and auditable
- only accept signed reports from authorized verifiers
- be robust against flapping and transient failures
- support multi-region quorum
- prioritize correctness/conformance failures appropriately
- emit an authoritative routing policy record used by resolvers/edges

---

## 2. Entities & Identifiers

- `backend_id`: identifies a backend integration.
- `policy_id`: identifies the policy parameters for that backend.
- `verifier_set_id`: identifies verifier membership for a given epoch.
- `region_id`: a coarse region bucket used for quorum diversity.

---

## 3. Backend States (Required)

Each backend MUST be in exactly one state:

- `HEALTHY`
- `DEGRADED`
- `DISABLED`
- `RECOVERING`

A backend’s state MUST be queryable and MUST be included in the routing policy record.

---

## 4. Global Modes (Optional)

The policy layer MAY also maintain global mode flags:

- `ATTACK_MODE` (boolean)
- `INCIDENT_LEVEL` (enum; optional): `NONE`, `ELEVATED`, `SEVERE`

Global modes are driven by aggregate signals across multiple backends and/or edges.

---

## 5. Inputs

### 5.1 Health Reports
The policy state machine consumes reports defined by:
- `specs/health-report-format.md`

### 5.2 Backend Policy Parameters
Each `backend_id` has parameters (governance-defined), including:

- `window_duration_seconds`
- `min_regions_for_quorum`
- `min_verifiers_for_quorum`
- `quorum_threshold` (e.g., 2/3)
- `degrade_success_rate_bucket_threshold`
- `disable_success_rate_bucket_threshold`
- `latency_p95_bucket_threshold` (optional)
- `conformance_required` (bool)
- `conformance_fail_triggers_disable` (bool)
- `consecutive_windows_to_degrade` (int)
- `consecutive_windows_to_disable` (int)
- `consecutive_windows_to_recover_start` (int)
- `consecutive_windows_to_restore_healthy` (int)
- `ramp_schedule` (see §9)
- `fallback_backend_set_id`
- `routing_weights_by_state` (see §10)

Policy parameters MUST be stored on-chain or referenced immutably by content hash.

---

## 6. Verification & Acceptance (Normative)

A Health Report MUST be rejected unless:
1) the signature is valid,
2) `verifier_id` is in the active `verifier_set_id`,
3) `window_id` matches canonical boundaries,
4) `region_id` is valid and acceptable by policy,
5) fields are within sanity bounds.

Rejected reports MUST have no effect.

---

## 7. Aggregation (Normative)

Policy aggregates accepted reports per `(backend_id, window_id)`.

### 7.1 Region Diversity
A window MUST only be considered “quorum-eligible” if reports come from at least:
- `min_regions_for_quorum` distinct regions.

### 7.2 Quorum Threshold
For a given window, compute:
- `eligible_verifier_count`
- `support_count` for each condition (e.g., “healthy”, “degraded”, “disabled”)

A condition is met if:
- `support_count / eligible_verifier_count >= quorum_threshold`
AND
- region diversity requirement is satisfied.

---

## 8. Condition Evaluation (Per Window)

For each backend/window, policy evaluates:

### 8.1 Performance Conditions
- `PERF_OK` if success bucket and latency buckets meet threshold
- `PERF_DEGRADED` if below degrade thresholds
- `PERF_DISABLED` if below disable thresholds (or dominated by timeouts)

### 8.2 Conformance Conditions
If `conformance_required = true`:
- `CONF_OK` if quorum PASS
- `CONF_FAIL` if quorum FAIL

If conformance is absent or `UNKNOWN`, policy treats it according to backend parameters (typically “no positive signal”).

### 8.3 Hard Failure Conditions
Hard failures are conditions that may immediately force `DISABLED`:
- quorum `INVALID_SIGNATURES`
- quorum `MALFORMED_RESPONSES`
- conformance FAIL with `conformance_fail_triggers_disable = true`
- governance emergency disable (explicit override)

Hard failure handling MUST be explicit and audited.

---

## 9. State Transitions (Normative)

State transitions occur only on window boundaries.

Let `W` be the current window index.

Policy maintains rolling counters per backend:
- `degraded_streak`
- `disabled_streak`
- `recover_streak`
- `healthy_streak`

### 9.1 HEALTHY → DEGRADED
Transition if:
- quorum window condition is `PERF_DEGRADED` OR `CONF_FAIL`
- for `consecutive_windows_to_degrade` windows.

Reset rules:
- if `PERF_OK` and `CONF_OK` for a window, reset `degraded_streak`.

### 9.2 DEGRADED → DISABLED
Transition if:
- `PERF_DISABLED` OR hard failure condition holds
- for `consecutive_windows_to_disable` windows
OR
- hard failure triggers immediate disable.

### 9.3 DISABLED → RECOVERING
Transition if:
- quorum indicates `PERF_OK` (and `CONF_OK` if required)
- for `consecutive_windows_to_recover_start` windows.

### 9.4 RECOVERING → HEALTHY
Transition if:
- sustained `PERF_OK` (and `CONF_OK` if required)
- for `consecutive_windows_to_restore_healthy` windows,
- AND ramp schedule has completed successfully (see §10.3).

### 9.5 RECOVERING → DEGRADED or DISABLED
If failures return during recovery:
- downgrade to `DEGRADED` if mild failures,
- or `DISABLED` if disable thresholds/hard failures occur.

---

## 10. Routing Policy Record (Output)

Policy emits a routing policy record per backend (and optionally a global record).

### 10.1 Required Fields
Per `backend_id`, the record MUST include:
- `backend_state`
- `policy_version`
- `effective_window_id`
- `fallback_backend_set_id`
- `routing_weight` (0..1 or basis points)
- `mode_flags` (e.g., `CACHE_FIRST`, `CACHE_ONLY`, `QUORUM_MODE`)
- `reason_codes` (coarse, audit-friendly)

### 10.2 Routing Weights by State (Example)
Governance defines default weights:
- HEALTHY: `1.0`
- DEGRADED: `0.2`
- DISABLED: `0.0`
- RECOVERING: ramp (e.g., `0.01 → 0.05 → 0.1 → 0.2 → 1.0`)

### 10.3 Ramp Schedule
Ramp schedules MUST be defined by governance and deterministic:
- step size per window
- maximum weight during RECOVERING
- conditions to advance to next step (must be PERF_OK + CONF_OK)

---

## 11. Attack Mode (Optional Global Logic)

Attack Mode triggers when aggregate conditions indicate systemic incident.

### 11.1 Suggested Trigger Signals
- K or more critical backends enter DEGRADED/DISABLED within M windows
- global timeout spike across multiple regions
- edge ingress overload signals (if included)

### 11.2 Attack Mode Outputs
When active, policy MAY set:
- global `ATTACK_MODE = true`
- per-backend mode flags:
  - `CACHE_FIRST` or `CACHE_ONLY` for selected namespaces/classes
  - stricter admission requirements signaled to ingress nodes
- temporary reward multipliers (handled in tokenomics, not here)

Attack Mode entry/exit MUST be auditable.

---

## 12. Governance Overrides (Explicit, Audited)

Governance MAY define explicit override operations:
- emergency `DISABLE_BACKEND(backend_id)`
- emergency `ENABLE_BACKEND(backend_id)` (still subject to recovery/ramp rules unless explicitly overridden)
- update policy parameters for future windows (timelocked)

Overrides MUST:
- be time-locked (recommended),
- emit events with reason codes,
- and not silently bypass verification rules.

---

## 13. Example Parameter Set (Illustrative)

- `window_duration_seconds = 300`
- `min_regions_for_quorum = 3`
- `quorum_threshold = 0.67`
- degrade if `success_rate_bucket < >=0.95` for 2 windows
- disable if `success_rate_bucket < >=0.75` for 5 windows
- require conformance, disable immediately if conformance FAIL for 2 windows
- recovery starts after 3 windows passing
- restore after 10 windows passing with ramp

---

## 14. Versioning

- This state machine spec SHOULD be versioned as `policy_state_machine_version`.
- If semantics change, the version MUST change.
- Resolvers MUST record which policy version they used for receipts and settlement.

---
