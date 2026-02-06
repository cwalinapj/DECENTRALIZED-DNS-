# Resilience Tokenomics (Anycast, Multi-Provider, Edges, Scrubbing)

This document defines how TollDNS incentivizes “lifeboat-grade” availability during large-scale attacks by embedding resilience requirements directly into miner eligibility, routing, and rewards.

## Motivation

A per-query toll reduces abuse that depends on valid queries, but it does not fully prevent volumetric or handshake-layer DDoS. To remain reachable when major DNS providers are attacked, the network must pay for:

- **Anycast** and wide geographic distribution
- **Multi-provider (multi-ASN) presence** to avoid correlated failure
- **Lots of edges** (many independent ingress points)
- **Upstream scrubbing capacity** (or equivalent DDoS absorption)

These are treated as first-class capabilities in the protocol.

---

## Capability Types

Miners may register one or more resilience capabilities:

1) **EDGE-INGRESS**
- Accepts client traffic (DoH/DoT) and either serves cache or forwards to resolvers.
- Must support “toll booth” gating (stateless token / QUIC Retry / rate limits).

2) **ANYCAST-INGRESS**
- Operates an anycast advertised endpoint (BGP) for a region bucket or global.
- Must provide proof of routing health and multi-vantage reachability.

3) **SCRUBBING-BACKEND**
- Provides DDoS filtering capacity upstream of ingress (contracted or self-operated).
- Can be delivered by:
  - specialized scrubbing operators, or
  - edge operators with proven absorption capacity.

4) **CORE-RESOLVER**
- Performs recursion/validation and coordinates routing + settlement.
- Not necessarily anycast (can be), but must have fast failover.

---

## Reward Model Overview

Rewards are paid primarily for **delivered service**, with additional **resilience multipliers** based on:
- region scarcity
- ASN/provider diversity contribution
- verified anycast availability
- verified scrubbing capacity during attacks
- performance under stress (tail latency + error rate)

### Base Rewards (per epoch)
- `ServingRewards`: proof-of-serving (requests/bytes) weighted by correctness + SLO
- `UptimeRewards`: availability and stability
- `CacheRewards` (optional): cache hit contribution that reduces core load

### Resilience Multipliers (per epoch)
- `RegionMultiplier`
- `DiversityMultiplier`
- `AnycastMultiplier`
- `ScrubbingMultiplier`
- `AttackModeMultiplier` (only active during declared incidents)

Final payout (conceptual):
`Payout = BaseRewards * RegionMultiplier * DiversityMultiplier * AnycastMultiplier * ScrubbingMultiplier * AttackModeMultiplier`

---

## Regional Scarcity (Quota-Aware Incentives)

Each region has target capacity for each capability (EDGE-INGRESS, ANYCAST-INGRESS, SCRUBBING-BACKEND).

If a region is under target, miners in that region earn a scarcity bonus:
- Example: If NA-WEST is at 60% of target edge-ingress capacity, `RegionMultiplier` increases.
- If a region is over target, bonus decreases.

This keeps the network geographically resilient.

---

## Provider / ASN Diversity (Anti-Correlated-Failure)

To avoid centralizing into one hosting provider, the protocol applies diversity rules:

### A) Traffic Steering Constraints (routing-time)
Resolvers must apply diversity constraints when selecting edges:
- cap selection share per ASN per region per window
- cap selection share per operator per region per window

### B) Reward Caps (settlement-time)
Even if routing misbehaves, rewards are capped:
- maximum % of epoch rewards per ASN
- maximum % of epoch rewards per operator

### DiversityMultiplier
Miners receive higher rewards when they increase diversity:
- miners in *rare ASNs* within a region get a bonus
- miners in already-dominant ASNs get no bonus (or a slight reduction)

---

## Anycast Incentives

Anycast is treated as a premium resilience service.

### Anycast Eligibility Requirements (suggested)
- BGP announcement with registered origin ASN(s)
- multi-vantage reachability checks (continuous)
- withdrawal/route flap penalties
- attack-mode survivability checks (p95 latency and loss thresholds)

### AnycastMultiplier
Applied only if the anycast ingress meets:
- minimum uptime
- minimum geographic reach (vantage checks)
- acceptable tail latency under stress

---

## Scrubbing Incentives (DDoS Absorption)

Scrubbing is expensive; tokenomics must explicitly fund it.

### Scrubbing Capacity Commitments
Scrubbing miners register:
- max clean throughput (Gbps)
- max new-connection capacity
- supported regions/ingress partnerships
- “activation policy” (when they engage scrubbing)

### Verification (practical)
- periodic controlled stress tests from verifier infrastructure
- incident-time telemetry proofs (packet drop ratios, filtered flows) summarized off-chain and attested into epoch updates

### ScrubbingMultiplier
- paid when scrubbing capacity is available
- paid more during verified attack periods (“AttackMode”)

---

## Attack Mode (Incident Declaration)

When a large-scale attack is detected, the network can enter **Attack Mode** for a time window.

Attack Mode effects:
- increased payouts for edge-ingress + anycast + scrubbing providers that maintain SLOs
- tighter admission gating requirements (toll booth hardened)
- routing prioritizes:
  - closest healthy ingress
  - diversity constraints
  - nodes with proven stress performance

Attack Mode should be time-bound and auditable (epoch-level logs/attestations), to prevent abuse.

---

## Why This Makes TollDNS Harder to Take Down

This design ensures the protocol continuously pays for the real ingredients of DDoS resilience:
- many geographically distributed ingress points
- independence from any single provider/ASN
- high-capacity filtering during incidents
- incentives that increase during attacks (so operators keep capacity “on standby”)

The toll is one layer; **the network’s funded edge + diversity + scrubbing** is what makes “take down the whole system” substantially harder.

---
