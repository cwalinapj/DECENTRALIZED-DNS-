# 06 — Resilience Tokenomics (Edges, Diversity, Anycast, Scrubbing)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This document defines how TollDNS funds and enforces “lifeboat-grade” resilience by embedding incentives for:

- **lots of edges** (many independent ingress points),
- **multi-provider / multi-ASN diversity** (avoid correlated failure),
- **anycast where possible**, and
- **DDoS scrubbing capacity** (or equivalent absorption).

Important context:

- The **toll** (paid in **Index Units**) reduces abuse that depends on valid queries, but it cannot stop pure bandwidth saturation by itself.
- Therefore, the network must continuously pay for distributed capacity and diversity.

---

## Goals

- Maintain availability during large-scale attacks and outages.
- Prevent centralization into a few hosting providers or regions.
- Make resilience an explicit, funded product of the protocol.
- Reward operators for measurable delivered service and stress performance.
- Ensure routing behavior enforces diversity constraints, not just economics.

---

## Economic Primitives Used Here

- **Index Units**: usage pricing / tolls (DNS queries, gateways, future “Cloudflare-like” features)
- **Native Token**: operator rewards, governance, reserves, incentives, and required staking for operators

(See `docs/05-tokenomics.md`.)

---

## Roles That Provide Resilience

Operators may register one or more capability roles:

### 1) EDGE-INGRESS

- Accepts client traffic (DoH/DoT), runs admission gating (“toll booth”), serves cache, forwards to resolvers/gateways.
- Primary unit of global reachability.

### 2) ANYCAST-INGRESS (Optional, advanced)

- Announces anycast VIP(s) (BGP) for regional or global ingress.
- Improves survivability and absorbs volumetric load across many POPs.

### 3) SCRUBBING-BACKEND (Optional, advanced)

- Provides DDoS filtering/absorption upstream of ingress.
- Can be a specialized operator role.

### 4) CORE-RESOLVER

- Performs recursion/validation and coordinates routing + settlement.
- Typically fewer and more carefully operated than edges.

### 5) CACHE / ROUTE-STORAGE

- Stores hot RRsets and validated pointer routes.
- Helps reduce upstream dependency and lowers cost under attack.

---

## Funding Source & Splits (Conceptual)

Index Unit toll revenue is allocated (governance-defined) among:

- **Operator Rewards Pool** (edges, gateways, resolvers, caches)
- **Resilience Pool** (anycast + scrubbing + “attack mode” bonuses)
- **DAO Treasury** (reserves, grants, audits, incident response)
- **Native Token Burn Link** (native burned as a function of Index Units purchased; see `docs/05-tokenomics.md`)

Exact splits are DAO parameters.

---

## Reward Model (Proof-of-Serving + Resilience Multipliers)

Rewards are paid primarily for delivered service (proof-of-serving), then adjusted by resilience multipliers.

### Base Rewards (per epoch)

- `ServingRewards`: successful requests/bytes served weighted by correctness + SLO
- `UptimeRewards`: availability and stability
- `CacheRewards` (optional): contribution to cache-hit ratio and reduced upstream load

### Resilience Multipliers (per epoch)

- `RegionScarcityMultiplier`
- `DiversityMultiplier` (ASN/provider/operator)
- `AnycastMultiplier`
- `ScrubbingMultiplier`
- `AttackModeMultiplier`

Conceptual payout:
`Payout = BaseRewards * RegionScarcityMultiplier * DiversityMultiplier * AnycastMultiplier * ScrubbingMultiplier * AttackModeMultiplier`

---

## Regional Scarcity (Quota-Aware Incentives)

The protocol sets target capacity per region for each role (EDGE-INGRESS, ANYCAST, SCRUBBING, etc.).

- Regions below target receive higher rewards.
- Regions above target receive reduced rewards.

This discourages “everyone rents the cheapest VPS in the same place” dynamics.

---

## Diversity Controls (Anti-Correlated-Failure)

To prevent centralization into a few hosting providers and ASNs, TollDNS enforces diversity both at:

### A) Routing-Time (Selection Constraints)

Gateways must apply constraints when selecting edges:

- **ASN caps**: limit routing share per ASN in a region per time window
- **Operator caps**: limit routing share per operator in a region per time window
- optional: **IP block caps** (/24, etc.) to avoid concentration in a single subnet

### B) Settlement-Time (Reward Caps)

Even if routing is temporarily biased, payouts are capped:

- maximum rewards share per ASN per epoch
- maximum rewards share per operator per epoch

### DiversityMultiplier

Operators earn a bonus when they increase diversity:

- edges in underrepresented ASNs get higher rewards
- edges in dominant ASNs get less (or no) diversity bonus

---

## Anycast Incentives (Premium Resilience)

Anycast ingress is treated as a premium role.

### Eligibility Requirements (suggested)

- registered origin ASN(s)
- continuous multi-vantage reachability checks
- route flap penalties
- performance SLO requirements (tail latency and loss)

### AnycastMultiplier

Applied only if anycast ingress meets:

- uptime minimum
- reachability across regions/vantages
- acceptable tail latency under load

---

## Scrubbing Incentives (DDoS Absorption Capacity)

Scrubbing is expensive and must be explicitly funded.

### Commitments

Scrubbing operators register:

- max clean throughput (Gbps)
- new connection capacity
- regions supported
- peering/ingress relationships (where traffic can be scrubbed)

### Verification

Verification can include:

- scheduled controlled stress tests by verifier infrastructure
- incident-time telemetry summaries attested into epoch updates (privacy-preserving)

### ScrubbingMultiplier

- paid when capacity is available
- paid more during Attack Mode windows

---

## Attack Mode (Protocol Pays More During Incidents)

Attack Mode can be triggered by watchdog policy (see `docs/03-watchdogs-and-fallback.md`).

When active, Attack Mode can:

- increase rewards for edges/anycast/scrubbing that maintain SLOs
- tighten admission gating requirements
- enforce cache-first or cache-only resolution for selected classes
- prioritize diverse and proven ingress nodes

The intent is to keep capacity online when it is most needed.

---

## Required Staking for Operators (Native Token)

All miner/operator roles require native token staking (see `docs/05-tokenomics.md`):

- minimum lock / freeze period
- cooling-off withdrawal delay
- optional later: slashing for objective provable violations

Stake reduces Sybil attacks and aligns incentives for resilience.

---

## Why This Makes TollDNS Harder to Take Down

This design ensures the protocol continuously pays for the real ingredients of resilience:

- many independent ingress points
- independence from any single provider/ASN
- extra absorption capacity for incident conditions
- incentives that increase during attacks, not decrease

The toll is one layer. The funded edge + diversity + capacity is what makes “take down the whole system” substantially harder.

---

## Next Docs

- Tokenomics: `docs/05-tokenomics.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Routing engine: `docs/07-routing-engine.md`
