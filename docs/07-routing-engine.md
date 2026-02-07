# 07 — Routing Engine (Selection, Quotas, Diversity, Health States)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This document describes how TollDNS routes queries across:

- core resolvers,
- edge ingress nodes,
- gateway operators,
- caches,
- and (optionally) anycast/scrubbing providers,

while enforcing:

- health-state policy (Healthy/Degraded/Disabled/Recovering),
- regional quotas,
- multi-provider/ASN diversity,
- and performance objectives.

The routing engine must be fast, deterministic enough to audit, and robust under attack.

---

## Goals

- Minimize latency and maximize success rate for normal users.
- Prevent “winner-take-all” centralization into a few operators/providers.
- Respect on-chain policy states (watchdogs) automatically.
- Provide graceful degradation (cache-first / cache-only) during incidents.
- Ensure business/dev/operator permission tiers are enforced where relevant.
- Keep blockchain out of the hot path.

---

## Routing Inputs

Routing decisions are made using:

### 1) Query Classification

- `namespace` (ICANN DNS, ENS, SNS, Handshake, PKDNS/PKARR, IPFS, etc.)
- `qtype` (A/AAAA/CNAME/TXT/HTTPS/SVCB/etc.)
- `is_gateway_required` (yes/no)
- `is_cache_eligible` (yes/no)
- `is_high_cost` (e.g., deep recursion, large responses, expensive upstream fetch)

### 2) Client Context (Minimal / Privacy-Preserving)

- coarse region hint (optional)
- transport (DoH/DoT)
- permission tier (end user vs business vs dev) if applicable
- session state (keepalive, session token)

### 3) Backend Registry & Capabilities

From the on-chain / signed registry:

- backend/operator capabilities (EDGE-INGRESS, GATEWAY, CACHE, ANYCAST, SCRUBBING)
- supported namespaces/features
- operator stake status (active/locked/penalized)
- region and ASN metadata (coarse, for diversity)
- advertised limits and pricing classes (policy-controlled)

### 4) Health & Conformance Policy

From the Policy Contract (watchdogs):

- backend state: `HEALTHY`, `DEGRADED`, `DISABLED`, `RECOVERING`
- routing weights / max shares
- attack mode flag (optional)
- fallback sets per backend

See: `docs/03-watchdogs-and-fallback.md` and `docs/04-functional-equivalence-proofs.md`

### 5) Performance Telemetry (Measured)

- rolling success rate
- latency distribution (p50/p95 buckets)
- error classes
- cache hit metrics (where applicable)

Telemetry should be aggregated and privacy-preserving.

---

## Routing Outputs

The router outputs:

- a selected primary target set:
  - resolver / edge ingress / gateway / cache
- optional fallback chain:
  - secondary targets
  - centralized fallback providers
- a policy version reference (for auditability)
- optional “mode flags” (cache-first, cache-only, upstream-quorum, etc.)

---

## Routing Stages

### Stage A: Select Ingress Path (Edge / Anycast / Direct)

Depending on deployment:

- prefer anycast VIP → nearest healthy edge ingress (when available)
- else select from regional edge ingress list
- else direct to core resolver (fallback/simple mode)

Ingress selection is constrained by:

- health state
- ASN/operator caps (diversity)
- region quotas (scarcity incentives)

---

### Stage B: Determine Backend Type

Based on query classification:

1) **ICANN DNS recursion**

- native recursion or upstream forwarding/quorum

1) **Web3 naming**

- chain adapter (ENS/SNS/Unstoppable/etc.)

1) **Alt-root / DHT naming**

- Handshake, PKDNS/PKARR, etc.

1) **Content retrieval**

- gateway selection (IPFS/Filecoin/Arweave) if needed

---

### Stage C: Select Cache vs Compute vs Upstream

For each backend type, decide:

- **Cache hit path** (preferred)
- **Compute path** (native resolution)
- **Upstream/quorum path** (bootstrapping/fallback/cross-check)

Under incident/attack mode:

- increase cache preference
- reduce expensive “miss” work
- tighten admission gating

---

### Stage D: Select Specific Operator(s)

Choose one or more operators using weighted scoring under constraints.

**Scoring factors (example):**

- health state (hard filter first)
- conformance status (hard filter for “correctness-required” paths)
- measured performance (latency/success)
- proximity (region)
- load/queue depth (if available)
- diversity bonus (underrepresented ASN/operator)
- regional scarcity bonus (if needed)

Selection can be:

- single primary + ordered fallbacks
- or small fanout for critical paths (hedged requests), with strict caps to avoid amplification

---

## Health-State Enforcement (Hard Rules)

Routing must treat policy state as authoritative:

- `DISABLED`: do not route (except explicit recovery probes)
- `DEGRADED`: reduce traffic share, prefer cache, add fallback
- `RECOVERING`: limited canary routing, stronger conformance checks
- `HEALTHY`: normal weighting

Policy state comes from watchdog quorum attestations.

---

## Diversity & Anti-Capture (Hard Constraints)

To prevent routing capture and correlated failure:

### ASN Caps

- limit share of requests routed to a single ASN within a region/time window

### Operator Caps

- limit share routed to a single operator within a region/time window

### Optional Subnet Caps

- /24 or similar caps to avoid concentration in a single network block

### Settlement-Time Reward Caps

Even if routing is temporarily biased, rewards are capped per ASN/operator per epoch.

See: `docs/06-resilience-tokenomics.md`

---

## Regional Quotas / Scarcity

Each region has target capacity per role:

- EDGE-INGRESS
- GATEWAY
- CACHE
- ANYCAST (optional)
- SCRUBBING (optional)

Routing should:

- prefer underfilled regions when feasible (within latency bounds)
- avoid overfilling a region with too many operators from the same provider

---

## Business / Developer / End-User Tiers

Role-based constraints (from `docs/05-tokenomics.md`):

- End users: Index Unit tolls, no required stake (default)
- Business users: Index Unit tolls + required native stake; may have higher limits
- Developers: required stake; additional permissions for adapter/gateway listings
- Miners/operators: required stake

Routing can optionally apply tier logic:

- business tiers may receive higher ceilings or priority queues (governance-defined)
- end users remain accessible and affordable (index-priced tolls)

---

## Bootstrapping and Upstream Quorum Mode

Early-phase:

- forward recursion to upstream DNS providers for reliability and route discovery

Quorum mode:

- query N upstreams and require agreement for correctness-sensitive paths
- use quorum results to populate safe caches
- reduce dependence over time as native recursion matures

Fallback:

- if internal systems degrade, revert to upstream-forwarded resolution temporarily

---

## Attack Mode Strategies (Degradation Without Collapse)

When Attack Mode is active:

- enforce “toll booth” gating (stateless challenges / retry tokens)
- switch to cache-first or cache-only for certain patterns
- reduce expensive recursion for randomized/unpopular names
- prefer proven edges/anycast/scrubbing providers
- shrink fanout and avoid amplification risks

Attack Mode is triggered by watchdog policy and is auditable.

---

## Implementation Notes (Non-Normative)

- Keep routing logic deterministic enough for audit:
  - fixed scoring weights per epoch
  - policy versioning
  - signed registry snapshots
- Avoid exposing fine-grained user location data:
  - use coarse region buckets
- Prefer hedged requests only where it improves tail latency without amplifying load.
- Ensure centralized fallback does not become the default:
  - apply fallback only when policy indicates, and recover back to decentralized backends automatically.

---

## Next Docs

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Tokenomics: `docs/05-tokenomics.md`
