# Watchdogs & Automatic Fallback (Immutable Policy + Verifiable Health)

TollDNS includes an “immutable watchdog” mechanism to automatically switch between:
- decentralized backends (preferred when healthy), and
- centralized fallbacks (used when unhealthy)

The critical design principle is:

> **On-chain policy is immutable. Off-chain measurement is decentralized and verifiable.**

On-chain programs cannot directly “watch the outside world.” They can only enforce rules based on inputs posted on-chain. Therefore, TollDNS uses **Verifier Nodes** to measure backend health and submit signed reports. The chain enforces an immutable circuit-breaker state machine.

---

## Goals

- Automatically protect resolution correctness and availability.
- Avoid catastrophic dependency on any single decentralized protocol.
- Provide graceful degradation under large-scale incidents.
- Ensure switching logic cannot be captured or silently changed.

---

## Key Concepts

### 1) Verifier Nodes (Watchdog Network)
Independent nodes that continuously probe:
- backend availability and correctness
- latency distributions (bucketed)
- error categories
- regional reachability

Verifiers submit signed **Health Reports** to the chain.

### 2) Policy Contract (Immutable Rules)
An immutable contract defines:
- which verifiers are authorized (verifier set)
- how many signatures are needed (quorum)
- what thresholds mean “Healthy / Degraded / Disabled”
- what actions are taken when a backend changes state
- recovery requirements (how long to be stable before re-enabling)

### 3) Backend States (Circuit Breaker)
Each backend is in one of:

- `HEALTHY` — normal routing share allowed
- `DEGRADED` — traffic reduced; fallback engaged partially
- `DISABLED` — traffic share near-zero; fallback engaged fully
- `RECOVERING` — limited traffic for verification; ramp-up rules apply

---

## Health Reports

A Health Report is a signed message posted on-chain:

- `backend_id`
- `region_id` (coarse)
- `window_id` (time bucket)
- `success_rate_bucket`
- `latency_p95_bucket`
- `error_class_counts` (coarse histogram)
- `conformance_result` (pass/fail/unknown) — optional
- `verifier_sig`

### Time Windows
Use short windows (e.g., 1–5 minutes) for responsiveness, but require multiple consecutive windows to trigger state changes to prevent flapping.

---

## Quorum Rules (Example)

A backend transitions to `DEGRADED` if:
- at least **2/3** of verifiers,
- in at least **3 distinct regions**,
- report success below threshold or conformance failure,
- for **2 consecutive windows**.

A backend transitions to `DISABLED` if:
- the same condition holds for **N windows** (e.g., 5),
- or a “hard failure” condition is met (e.g., cryptographic invariants broken).

Recovery (`RECOVERING` → `HEALTHY`) requires:
- success above threshold,
- conformance passing,
- for **M consecutive windows** (e.g., 10),
- plus ramp-up steps.

---

## Automatic Fallback Actions

When backend state changes, the policy contract updates a **Routing Policy Record** (on-chain) that resolvers must honor.

### Actions by State

#### HEALTHY
- normal traffic share
- normal caching rules
- normal SLO thresholds

#### DEGRADED
- reduce backend share
- enable fallback backend set
- switch to cache-prefer / cache-only for expensive paths
- increase verifier probing frequency (optional)

#### DISABLED
- route nearly all traffic to fallback set (centralized or alternate backend)
- if safe: serve cache-only for previously validated data
- enter “Attack Mode” if multiple backends degrade simultaneously

#### RECOVERING
- allow small traffic percentage
- require stronger conformance checks
- ramp up gradually if stable

---

## What “Centralized Fallback” Means

Fallback can include:
- upstream DNS providers (Cloudflare/Google/etc.)
- resolver-owned infrastructure
- centralized gateways for content retrieval
- centralized chain RPC providers for web3 lookups

Fallback is policy-controlled and time-bounded:
- used only when needed,
- automatically phased out when decentralized backend recovers.

---

## Enforcement: Making Resolvers Follow Policy

Resolvers must:
- periodically fetch current policy state (or subscribe)
- select backends and traffic shares according to the on-chain policy record
- include policy version in settlement proofs/receipts (optional)

Non-compliant resolvers can be:
- removed from the registry,
- denied settlement,
- or slashed (later phase).

---

## Incident Modes

The policy contract may declare `ATTACK_MODE` when:
- multiple backends enter DEGRADED/DISABLED,
- edge ingress health indicates broad overload,
- or verifier-detected network anomalies occur.

Attack Mode may:
- tighten admission gating (“toll booth” policies)
- shift toward cache-only operation
- increase rewards for resilient edge + scrubbing providers
- reduce expensive recursion for unknown/random names

(See `docs/06-resilience-tokenomics.md` if present.)

---

## Summary

Watchdogs provide:
- distributed measurement,
- immutable switching logic,
- and automatic fallback to keep resolution working.

Functional correctness checks are defined in `docs/04-functional-equivalence-proofs.md`.
