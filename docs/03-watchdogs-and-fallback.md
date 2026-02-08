# 03 — Watchdogs & Automatic Fallback (Immutable Policy + Verifiable Health)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

TollDNS includes an “immutable watchdog” mechanism to automatically switch between:

- decentralized backends (preferred when healthy), and
- centralized fallbacks (used when unhealthy)

**Key principle:** on-chain policy is immutable; off-chain measurement is decentralized and verifiable.

This document explains how TollDNS can “watch” outside-world protocol health, trigger automatic routing changes, and safely fall back to centralized services when needed.

---

## Why This Exists

On-chain programs cannot directly observe the internet. They can only enforce rules based on inputs posted on-chain.

Therefore TollDNS uses a distributed network of **Verifier Nodes** that measure backend health and conformance, then submit signed attestations. An immutable on-chain **Policy Contract** aggregates those attestations and updates routing policy via a circuit-breaker state machine.

This ensures TollDNS remains functional when:

- a decentralized protocol is down or degraded,
- an integration becomes unsafe or incorrect,
- a network incident impacts availability,
- or a backend is attacked/censored.

---

## What Gets Watched (Examples)

Backends and dependencies that can be monitored:

### Naming / Resolution

- ENS: <https://github.com/ensdomains>
- Solana Name Service / Bonfida (.sol): <https://github.com/Bonfida>  
  SNS SDK: <https://github.com/SolanaNameService/sns-sdk>
- Unstoppable Domains Resolution: <https://github.com/unstoppabledomains/resolution>
- Handshake (alt-root) + hnsd: <https://github.com/handshake-org> and <https://github.com/handshake-org/hnsd>
- PKDNS / PKARR: <https://github.com/pubky/pkdns> and <https://github.com/pubky/pkarr>

### Content / Storage (Gateways)

- IPFS: <https://github.com/ipfs>
- Filecoin: <https://github.com/filecoin-project>
- Arweave: <https://github.com/arweaveteam>

### Centralized Fallbacks / References

- Upstream DNS providers (e.g., Cloudflare/Google/etc.) used as fallback targets and/or reference baselines
- Centralized RPC providers used as temporary fallback for web3 lookups

---

## Goals

- Protect correctness and availability automatically.
- Avoid catastrophic dependency on any single decentralized backend.
- Prevent silent failure: state changes and policy transitions should be auditable.
- Make switching logic immutable (or governed transparently), not operator discretion.

---

## Roles & Responsibilities

### Verifier Nodes (Watchdog Network)

Verifier nodes:

- probe backends from multiple regions
- run conformance checks against bounded challenge sets
- classify failures (timeouts, invalid responses, wrong semantics, etc.)
- submit signed health reports on a fixed schedule

Verifier nodes should be diverse by:

- geography
- operator
- hosting provider / ASN

### Policy Contract (Immutable Circuit Breaker)

The Policy Contract:

- defines allowed verifiers and quorum rules
- defines thresholds for state transitions
- defines the allowed fallback targets per backend
- emits the current backend health state and routing policy version

### Gateways / Edges (Policy Enforcers)

Gateways and edge ingress operators:

- periodically fetch policy state (or subscribe)
- route traffic only according to the policy record
- include policy version in receipts/settlement proofs (optional, but recommended)

---

## Backend State Machine

Each backend is in one of four states:

- `HEALTHY` — normal routing share allowed
- `DEGRADED` — traffic reduced; fallback engaged partially; tighter rules
- `DISABLED` — traffic near-zero; fallback engaged fully
- `RECOVERING` — limited traffic allowed; ramp-up rules apply

### Why `RECOVERING` exists

To avoid flapping and to validate real recovery under live traffic.

---

## Health Reports (Attestations)

A Health Report is a signed message submitted on-chain by verifiers:

- `backend_id`
- `region_id` (coarse region bucket)
- `window_id` (time bucket)
- `success_rate_bucket` (e.g., 99/95/90/75/etc.)
- `latency_p95_bucket` (bucketed ms range)
- `error_class_counts` (coarse histogram)
- `conformance_result` (pass/fail/unknown)
- `verifier_sig`

### Notes

- Reports should be small and privacy-preserving.
- Full logs stay off-chain; only aggregated metrics and signatures go on-chain.

---

## Quorum & Transition Rules (Example Policy)

**DEGRADED trigger**
A backend transitions `HEALTHY → DEGRADED` if:

- ≥ 2/3 of active verifiers,
- across ≥ 3 distinct regions,
- report `success_rate` below threshold OR conformance failure,
- for ≥ 2 consecutive windows.

**DISABLED trigger**
A backend transitions `DEGRADED → DISABLED` if:

- the above holds for N windows (e.g., 5),
- OR a hard failure occurs (cryptographic invariant breaks).

**RECOVERING trigger**
A backend transitions `DISABLED → RECOVERING` when:

- reports indicate recovery begins (success above threshold),
- AND conformance returns to passing for at least K windows.

**HEALTHY restore**
`RECOVERING → HEALTHY` requires:

- sustained health + conformance for M windows (e.g., 10),
- plus gradual ramp-up (see below).

---

## Automatic Fallback Actions

When a backend’s state changes, the Policy Contract updates a **Routing Policy Record** that resolvers must follow.

### HEALTHY

- normal routing weights
- normal caching rules
- standard SLO thresholds

### DEGRADED

- reduce routing weight to the backend
- enable fallback backends (centralized or alternate decentralized)
- prefer cache-first behavior (avoid expensive new work)
- optionally tighten admission (toll booth)

### DISABLED

- route near-zero traffic to the backend
- route traffic to fallback backend set
- optionally serve cache-only for previously validated results
- optionally enable Attack Mode if multiple backends degrade

### RECOVERING

- permit small routing weight (canary traffic)
- require stronger conformance checks
- ramp-up slowly if stable

---

## Attack Mode (Optional Policy Feature)

Attack Mode can be declared when:

- multiple key backends degrade simultaneously,
- verifier signals indicate global incidents,
- edge operators report sustained overload.

Attack Mode may:

- tighten admission gating (stateless tokens / QUIC retry / session tickets)
- enforce cache-first or cache-only resolution for selected classes
- reduce expensive recursion for suspicious/randomized names
- increase rewards for resilient edges/scrubbing providers (tokenomics-driven)

---

## Compliance: Spend Escrow vs Governance Stake

TollDNS uses:

- **Spend escrow** for user convenience (prepaid tolls; no per-query prompts)
- **Governance stake pool** for accountability (time-locked)

We explicitly avoid “refundable escrow staking” as a security tool. Operator/gateway stake must be time-locked (and potentially slashable later) so misbehavior cannot be followed by instant exit.

See: `docs/05-tokenomics.md`

---

## Making This Auditable

To keep policy transitions transparent:

- policy parameters should be stored on-chain or referenced by content-hash
- verifier sets and their keys should be visible
- state transitions should emit events with the reason code (e.g., performance vs conformance failure)
- any DAO override mechanisms should be explicit and logged

---

## Next Docs

- Functional equivalence proofs: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Resolution backends: `docs/02-resolution-backends.md`
