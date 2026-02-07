# 08 — Threat Model (Abuse, DDoS, Censorship, Economic Attacks)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This document outlines the primary threats against TollDNS and the mitigations built into the design. TollDNS aims to be a resilient “decentralized Cloudflare-like” network, so the threat model covers both **technical** and **economic/governance** attacks.

TollDNS uses:

- **Index Units** for tolls (stable usage pricing),
- a **native token** for staking, governance, incentives, reserves, and burns,
- **watchdogs + immutable policy** for automatic fallback,
- **regional quotas + diversity constraints** to prevent correlated failure.

See also:

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Tokenomics: `docs/05-tokenomics.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`

---

## Security Goals (What We Want)

1) **Availability:** resolve names reliably under stress and partial failures.  
2) **Correctness:** return correct answers per defined conformance profiles.  
3) **Integrity:** ensure records/pointers/cached routes are not silently tampered with.  
4) **Resilience:** avoid single points of failure and correlated provider outages.  
5) **Abuse resistance:** make common attacks costly and limit amplification.  
6) **Governability:** allow safe delisting/degradation while preventing capture.

---

## Trust & Assumptions

- Clients can hold keys for vouchers and spend policy locally.
- The L2 can enforce immutable policy/state machines and settlement logic.
- Watchdog verifiers are diverse and can be configured with quorum thresholds.
- Centralized fallbacks exist but are only used when policy dictates (not as default).

Non-goals / constraints:

- Toll pricing cannot stop pure volumetric bandwidth floods by itself.
- On-chain contracts cannot directly observe the outside world without verifiers/oracles.

---

## Threat Categories

### 1) Volumetric DDoS (Bandwidth Saturation)

**Threat:** attackers saturate links or POPs with raw traffic (paid or unpaid).  
**Why tolls alone don’t solve it:** attackers can flood without completing valid queries.

**Mitigations:**

- many edges (“lots of ingress points”)
- multi-provider / multi-ASN distribution
- anycast ingress where possible
- upstream scrubbing providers (optional role)
- attack mode policies: cache-first, reduced expensive work, tighter admission

See: `docs/06-resilience-tokenomics.md`

---

### 2) Handshake/Connection Floods (CPU Exhaustion)

**Threat:** attackers overwhelm DoH/DoT endpoints with handshakes and expensive setup.

**Mitigations (“toll booth” gating):**

- prefer cheap rejection paths
- stateless challenge tokens / retries (e.g., QUIC retry patterns)
- session resumption / keep-alives
- rate limiting by source buckets (careful with NAT/shared IPs)
- separate ingress from recursion work (edge handles admission)

---

### 3) DNS Amplification / Reflection Abuse

**Threat:** attackers use resolvers to amplify traffic to victims.

**Mitigations:**

- default to DoH/DoT (TCP-based) reduces classic UDP reflection
- strict limits on response size and suspicious patterns
- require vouchers for service beyond minimal unauthenticated responses (policy-defined)
- deny recursion for clearly abusive patterns in Attack Mode

---

### 4) Cache Poisoning / Incorrect Resolution

**Threat:** injecting wrong answers into caches or tricking resolvers into storing incorrect routes.

**Mitigations:**

- DNSSEC validation where applicable (policy-defined)
- upstream quorum checks for non-DNSSEC domains (during bootstrapping and optionally ongoing)
- bounded TTL and conservative caching
- conformance profiles + verifier challenge sets
- signed receipts and auditability of cache fills

See: `docs/04-functional-equivalence-proofs.md`

---

### 5) Sybil Attacks on Miner/Operator Set

**Threat:** attacker spins up many fake operators to capture routing share or rewards.

**Mitigations:**

- **required native token stake** for miners/operators (time-locked)
- registry admission rules (cap per operator, cap per ASN/region)
- routing-time diversity constraints + settlement-time reward caps
- progressive trust: new operators ramp up slowly (RECOVERING-like probation)

See: `docs/05-tokenomics.md` and `docs/07-routing-engine.md`

---

### 6) Economic Attacks on Tolls / Index Unit

**Threat:** manipulate the Index Unit oracle or pricing model to make tolls unfair or unstable.

**Mitigations:**

- multiple independent oracle sources (quorum)
- slow-moving update cadence + bounds (rate-of-change limits)
- emergency governance pause / fallback pricing mechanism
- transparent on-chain parameters and audit trail

---

### 7) Governance Capture / Malicious Proposals

**Threat:** attackers accumulate influence and approve malicious gateways, delist good ones, or change parameters to centralize control.

**Mitigations:**

- time-locked governance stake with exit delays
- proposal timelocks (delayed execution)
- multi-stage approval for sensitive changes (e.g., gateway delisting, oracle changes)
- diverse verifier sets + immutable watchdog rules that cannot be bypassed easily
- “safety rails” parameters that require supermajority

---

### 8) Malicious Gateways / Policy Violations

**Threat:** gateways route or cache content that violates policy (e.g., piracy, malware distribution).

**Mitigations:**

- DAO-curated gateway listings
- watchdog monitoring + delisting mechanisms
- hosted gateway infrastructure (early phases) to enforce policy reliably
- auditing model:
  - human review workflows
  - automated AI crawler checks
- clear acceptable-use rules and transparent enforcement events

Note: privacy-preserving access methods may be allowed where lawful (e.g., Tor gateways), governed by explicit rules.

---

### 9) Centralized Fallback Dependency Risk

**Threat:** fallback to Cloudflare/Google becomes the default, undermining decentralization.

**Mitigations:**

- fallbacks only enabled when policy triggers DEGRADED/DISABLED states
- automatic recovery back to decentralized backends
- transparency: publish fallback activation metrics
- incentivize decentralized capacity via scarcity + diversity multipliers

---

### 10) Data Privacy & Query Metadata Leakage

**Threat:** operators learn user browsing patterns.

**Mitigations (design options):**

- minimize client metadata (coarse region only)
- support privacy-preserving transports and policies where feasible
- separate roles (ingress vs resolver) to reduce full visibility
- avoid logging raw queries; use aggregated metrics for settlement and health

---

## Incident Response Model

When verifiers detect widespread degradation:

- Policy contract enters DEGRADED/DISABLED states for affected backends
- Routing engine shifts to:
  - cache-first/cache-only where possible
  - fewer expensive operations
  - stronger admission gating
  - centralized fallback only if required
- Attack Mode may be declared (optional), increasing rewards for resilient operators

All state changes should be auditable on-chain.

---

## Summary

TollDNS assumes it will be attacked both technically and economically. The design defends by combining:

- stable Index Unit pricing for usage
- role-based staking for accountability
- watchdog-driven automatic fallback
- diversity constraints to prevent correlated failures
- explicit funding for edges/anycast/scrubbing
- transparent governance and enforcement

---

## Next Docs

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`
