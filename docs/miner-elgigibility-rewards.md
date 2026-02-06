# Miner Eligibility & Rewards

This document defines how miners qualify to participate and how they earn tokens.

## Goals

- Reward miners for **delivered service** (proof-of-serving), not mere claims.
- Maintain global distribution using **quota per region**.
- Reduce correlated failure and capture risk (avoid “everyone in the same provider/region”).
- Enable predictable performance (latency/uplink/uptime).

## Miner Capabilities

A miner may provide one or more services:

- **Gateway**: HTTP gateway for Web3/IPFS-style resolution and content access.
- **Edge cache**: stores hot validated data (RRsets/pointers/cache objects).
- **Edge DoH** (optional): serves cache hits in-region.

## Eligibility Requirements (Suggested)

Minimum requirements to be considered “active”:
- Stake deposited (amount may vary by role and region)
- Stable endpoint reachable over TLS (mTLS optional)
- Meets baseline SLO during probation:
  - uptime target
  - error rate cap
  - latency cap (region-relative)
- Passes basic correctness checks:
  - returns valid signed artifacts where required
  - does not serve malformed or obviously invalid data

## Rewards: Pay for Serving

### Primary Reward: Proof-of-Serving
The main reward should be based on measured service delivered:
- successful served requests
- bytes served (gateway traffic)
- sustained throughput under real load
- tail latency performance (p95/p99)
- error rate

**Why this matters:** it makes “proxying” less of a cheat. If a miner fronts with a VPS, they still pay for bandwidth/compute and must hit SLO.

### Secondary Reward: Proof-of-Storage (Optional Bonus)
Proof-of-storage is best treated as:
- eligibility for cache roles, and/or
- a small multiplier bonus

Storage-only rewards are easy to game unless challenges are frequent, unpredictable, and multi-vantage.

## Regional Quotas

### Why Quotas
Without constraints, miners will cluster in the cheapest region/provider. Regional quotas:
- ensure global coverage
- reduce correlated failure
- improve routing choices (more nearby capacity)

### Concept
Define regions (example):
- `NA-WEST, NA-EAST, EU-WEST, EU-CENTRAL, APAC, SA, AFR, OCE`

Each region has a target number of active miner slots per capability:
- Gateway slots
- Cache slots
- Edge DoH slots

### Admission & Replacement Rule (Suggested)
If a region-capability bucket is full:
- a candidate miner can enter only by outscoring the lowest-performing active miner in that bucket
- the replaced miner becomes inactive (can re-qualify later)

This avoids “first come, first served.”

## Diversity Controls (Strongly Recommended)

Regional quotas alone don’t stop a single hosting provider from dominating.

Add one or more:

### Provider/ASN Caps
- cap % of rewards or traffic per ASN per epoch, or
- cap active slots per ASN per region bucket

### Operator Caps
Limit the number of active nodes per operator identity.

### Progressive Stake
The Nth node for an operator requires more stake (e.g., doubles each additional node).

These controls reduce “one entity runs 500 nodes” centralization.

## Scoring Model (Example)

Each epoch, compute a miner score:

- **Serving score (dominant):**
  - served requests/bytes weighted by correctness and SLO
- **Reliability:**
  - uptime, error rate, disconnect frequency
- **Performance:**
  - p95/p99 latency from region verifiers
- **Optional storage bonus:**
  - success rate of random challenges

Scores should be:
- bounded (avoid runaway winners)
- robust to gaming (use rolling windows, multiple verifiers)

## Slashing (Optional Early, Stronger Later)

Slashing should be reserved for provable misconduct, e.g.:
- serving invalid signed artifacts
- repeated falsified receipts
- protocol violations that can be proven with logs/cryptographic evidence

Performance alone should generally reduce rewards, not slash stake.

## Notes

- Rewarding delivered service aligns incentives with user experience.
- Quotas + diversity caps are core to the “decentralized Cloudflare” goal.
