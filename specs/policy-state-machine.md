# Policy State Machine (Health + Conformance + Safety)

This document defines the immutable policy state machine used by the watchdog contract. The chain does not observe the internet directly; it only enforces state transitions based on verifier attestations.

---

## States

- **Healthy**: backend receives normal traffic share.
- **Degraded**: backend receives reduced traffic share; increased monitoring.
- **Disabled**: backend is removed from active routing; traffic shifts to fallback.
- **Recovering**: backend is reinstated gradually after sustained recovery.

---

## Inputs (Verifier Reports)

The policy contract consumes:
- health metrics (availability, latency, error class breakdown),
- conformance results (challenge set checks),
- safety checks (signature validity, malformed responses).

---

## Switching Rules (To Fallback)

A backend transitions to **Degraded** or **Disabled** when any of the following holds:

1. **Health failure**: availability/performance below threshold, OR
2. **Conformance failure**: equivalence checks fail for challenge sets, OR
3. **Safety failure**: invalid signatures/proofs or repeated malformed behavior.

---

## Fallback Actions

When Disabled:
- route that backend’s traffic share to the fallback set: `{Cloudflare, Google, …}` (configurable),
- keep serving cached data if safe,
- raise Attack Mode if multiple backends degrade concurrently.

---

## Recovery Rules

To move from Disabled → Recovering → Healthy:
- backend must be **healthy for N consecutive windows**,
- conformance checks must pass during recovery,
- traffic ramps back gradually over configured windows.
