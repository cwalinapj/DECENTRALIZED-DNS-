# Watchdogs and Fallback (Immutable Policy + Verifier Reports)

On-chain programs cannot “see the outside world” directly. They can only react to inputs that are posted on-chain. For watchdogs this means:
- the **immutable policy** lives on-chain,
- the **world-watching** is done by off-chain verifiers posting signed health reports.

This document defines the policy contract, verifier model, and how failover is triggered.

---

## Immutable Policy Contract (On-Chain)

The immutable policy contract defines:
- **what “healthy” means** (thresholds and SLOs),
- **who can report health** (verifier set),
- **quorum rules** and time windows,
- the **state machine** (Healthy → Degraded → Disabled → Recovering),
- **automatic routing/fallback actions**.

The chain does not watch the internet; it enforces a deterministic state machine driven by verifier attestations.

---

## Verifier Set Model

- **Regional verifier sets**: each backend has a verifier set that spans multiple regions and ASNs.
- **Rotating keys**: verifiers publish rotating signing keys (e.g., per-epoch) to limit long-lived compromise risk.
- **Weighted quorums**: weights can be assigned by region, ASN diversity, or performance history.

Verifier membership and weights are part of the policy contract (or referenced by a policy config ID).

---

## Health Report Schema + Cadence

Verifiers post signed **Health Reports** into the chain at a fixed cadence (e.g., every 5 minutes per backend).

Suggested report fields:
- `backend_id`
- `adapter_id`
- `policy_config_id`
- `verifier_id`
- `window_start`, `window_end`
- `region`
- `metrics`:
  - success rate
  - p95 latency
  - error class breakdown
  - conformance check summary (pass/fail + sample size)
- `signature`

Cadence is configured per backend (shorter for critical DNS paths, longer for low-traffic namespaces).

---

## Quorum Rules + Time Windows

- Reports are grouped into **fixed time windows** (e.g., 5-minute buckets).
- A backend’s state change requires a **quorum of verifiers** across regions.
- Optional rule: require **M-of-N regions** to avoid a single-region outage triggering global failover.
- Sliding window logic can be used to reduce flapping.

---

## Circuit-Breakers (Automatic Fallback)

When a backend is reported unhealthy, the policy contract can trigger:
- **Disable backend** (stop serving new traffic from that adapter)
- **Shift traffic** to centralized fallback (Cloudflare/Google, or another adapter)
- **Attack Mode** (tighten admission gates, throttle, prioritize cached answers)

These actions are deterministic and derived from the policy config.

---

## Recovery Rules

To avoid oscillation, re-enable only after sustained recovery:
- Backend must be **healthy for N consecutive windows**.
- Recovery windows can be longer than failure windows.
- Optional: require conformance proofs (not just availability) before re-enabling.

---

## Immutable Watchdog References (Registry / NFT Pointers)

If you want “NFT pointers to immutable watchdog programs,” use an on-chain registry (NFTs or standard registry entries) where each backend records:
- `backend_id`
- `adapter_id`
- `policy_config_id`
- `verifier_set_id`
- `watchdog_program_hash` (content-addressed pointer)

This provides immutable references even if verifier software or off-chain infrastructure evolves.
