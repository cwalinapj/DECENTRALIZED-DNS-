# TollDNS — A Token-Paid Recursive DNS + Subsidized Web3 Gateway Network (Concept)

> **Status:** Early concept / design notes  
> **Goal:** Build a recursive DNS resolver that charges a tiny “toll” per query in a native token, using those tolls to subsidize a decentralized network of Web3/IPFS gateway capacity operated by miners.

---

## TL;DR

**TollDNS** is a **paid recursive DNS resolver** (primarily via **DoH/DoT**) where each query costs a small amount of a **native token**. Users deposit tokens into **escrow** so queries don’t require popups or confirmations.  
A **miner network** earns tokens by operating **gateway + cache infrastructure** and meeting performance/correctness requirements.  
A custom **L2 blockchain** provides the accounting/control plane for escrow, rewards, staking, and miner registry—without putting per-query traffic on-chain.

---

## Prototype Implementation (Work in Progress)

The repository now includes a minimal, working baseline for:

- **Resolver service** (`src/resolver/resolverService.js`) — verifies vouchers, tracks sequences, and selects miners.
- **Client gateways** (`src/client-gateway/`) — shared gateway client plus platform stubs (iOS, Android, Windows, Linux, macOS).
- **Client stub resolver** (`src/client-stub/`) — creates vouchers and calls the resolver API.

### Quick start (resolver)

```bash
npm run start:resolver
```

### Quick start (stub resolver)

```bash
node -e "const { createStubResolver } = require('./src/client-stub'); (async () => { const client = createStubResolver({ resolverUrl: 'http://localhost:8787' }); console.log(await client.resolve({ name: 'example.com', needsGateway: true })); })();"
```

---

## Motivation

DNS is a high-value target for abuse:
- DDoS against resolvers
- random-subdomain / NXDOMAIN floods
- cache poisoning attempts
- abuse of “free” Web3 gateways

Adding a **micro-toll** introduces real cost per request, making many attacks **economically expensive** while funding shared infrastructure (gateways, caching, availability).

---

## Design Principles

- **No per-query on-chain transactions** (too slow/expensive)
- **Micropayments via escrow + off-chain vouchers**, settled in batches on L2
- **DoH/DoT first** (reduce reflection/amplification risk and add authentication)
- **Pay for delivered service** (proof-of-serving), not just claims
- **Quota per region** to reduce correlated failure and keep the network globally distributed
- **Privacy-aware**: do not store per-user query logs on-chain

---

## System Overview

### Actors
- **Client**: phone/desktop/router app with local stub resolver + wallet
- **Resolver**: paid recursive DoH/DoT service (can forward “normal DNS” to existing providers)
- **Miners**: run Web3/IPFS gateways and optionally edge cache/DoH endpoints
- **L2 Chain**: token, escrow, miner registry, reward distribution, slashing (control plane)

---

## Query Flow (High-Level)

1. User device sends a DNS query to the **local stub** (app/service).
2. Stub forwards the query via **DoH/DoT** to a TollDNS resolver and attaches a **signed payment voucher**.
3. Resolver verifies voucher quickly (signature + sequence checks) and responds.
4. Resolver batches vouchers and periodically settles totals on the **L2 escrow contract**.

**Key UX goal:** user does **not** click “OK” for every query.

---

## Payment Model

### Escrow
Users deposit tokens into an on-chain escrow. The local wallet enforces:
- max spend/day
- per-domain/category limits
- emergency stop
- resolver allowlist

### Off-Chain Vouchers (Micropayments)
Each query includes a signed authorization (voucher), e.g.:
- user public key
- resolver ID
- amount (toll)
- sequence number (monotonic)
- expiry
- optional binding to query hash
- signature

Resolvers settle **in batches** on-chain to avoid per-query transactions.

---

## Mining Model

Miners contribute infrastructure such as:
- **Web3 gateway capacity** (HTTP gateways for IPFS / name systems)
- **Edge caching** (hot RRsets, validated records, web3 pointer data)
- Optional: **DoH edge endpoints** for cache hits / regional acceleration

Miners earn tokens primarily for:
- **Proof-of-serving** (successful responses + bandwidth served)
- performance (latency, uptime, tail latency)
- correctness (validated data, no invalid responses)
- optional **proof-of-storage** bonuses

---

## Regional Quotas (Anti-Centralization)

A major risk is miners clustering in a few cheap hosting regions/providers.

To encourage global coverage and reduce correlated failure, TollDNS uses **quota per region**:

- The network defines regions (example):  
  `NA-WEST, NA-EAST, EU-WEST, EU-CENTRAL, APAC, SA, AFR, OCE`
- Each region has a target capacity / slot count.
- Miners compete within a region for active slots based on:
  - stake
  - performance score
  - serving receipts (real delivered work)
  - availability history

**Admission rule idea:** if a region is at capacity, the lowest-scoring active miner is replaced by a higher-scoring candidate.

> Note: Region is treated as a *performance attribute* (measured RTT/SLO from verifiers), not a perfect “GPS truth.”

---

## Web2 vs Web3 Resolution

### Web2 (normal DNS)
- TollDNS can recursively resolve normally.
- Optionally forward to established resolvers (Cloudflare/Google/etc.) for cost efficiency and reliability.
- DNSSEC validation policy to be defined (recommended).

### Web3 / IPFS / Gateways
- Certain namespaces (e.g., `.eth`, `.sol`, `ipfs://`) are resolved through:
  - miner-operated gateways
  - fallback gateways
- Gateways are subsidized by toll revenue and miner rewards.

**Goal:** make Web3 content reachable with standard apps via the client stub/router integration.

---

## L2 Blockchain Responsibilities

**On-chain (recommended minimal set):**
- token + staking
- escrow + settlement
- miner registry (identity keys, endpoints, region bucket)
- reward distribution epochs
- slashing conditions for provable fraud (optional early-phase)

**Off-chain (hot path & privacy):**
- per-query details
- raw performance metrics
- routing tables and miner selection logic
- exact geolocation (use coarse region labels)

---

## Security & Abuse Resistance

### What the toll helps with
- makes high-volume abuse expensive
- funds capacity to absorb attacks (gateway + resolver scaling)
- discourages random-subdomain floods by pricing policy

### What still needs engineering
- rate limiting & surge pricing policies
- anti-sybil measures (stake + identity)
- replay protection (voucher sequences)
- correctness enforcement (DNSSEC validation, signed gateway artifacts)
- diversity constraints (avoid one provider/ASN dominating)

---

## MVP Roadmap

### Phase 1 — Paid DoH Resolver + Client Wallet
- local stub + wallet on desktop/phone
- escrow deposits + signed vouchers
- resolver batch settlement on chain (or temporary backend → chain later)

### Phase 2 — Miner Gateways (Subsidized)
- miner registry + staking
- gateway routing + performance scoring
- rewards for serving bandwidth/requests

### Phase 3 — Regional Quotas + Diversity Controls
- region slot caps
- replacement rules based on score
- optional provider/ASN caps

### Phase 4 — Hardening / Slashing / Governance
- slashing for provable invalid serving
- decentralized verifier set
- governance for pricing/regions/policies

---

## Open Questions

- Voucher format and settlement mechanism (channels vs batch receipts)
- DNSSEC policy and validation placement (resolver vs miner vs both)
- Name resolution strategy for `.eth/.sol` (stub-level rules vs gateway domains)
- Miner scoring formula and anti-gaming mechanisms
- Region definitions and how to handle mobile/roaming clients
- Privacy model: what logs exist, where, retention policies

---

## Disclaimer

This repository describes a **concept** for a decentralized, token-incentivized DNS + gateway network.  
It is not a commitment to specific functionality or security guarantees. Expect iteration.

---

## Contributing

PRs and design feedback welcome:
- payment/voucher mechanisms
- L2 contract interfaces
- miner incentive models
- resolver/gateway architecture
- threat modeling
