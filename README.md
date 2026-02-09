# DECENTRALIZED-DNS (TollDNS) — A Decentralized “Cloudflare-Like” Resolver + Gateway Network

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

- 📄 Prospectus: `PROSPECTUS.md`

TollDNS is a concept for a **decentralized cloud-edge fabric** built around a **paid recursive DNS** (DoH/DoT) and an extensible network of **gateway + caching + ingress** operators (“miners”). A small **toll per query** funds infrastructure and makes abusive query patterns economically costly.

The long-term goal is a “decentralized Cloudflare”: many independent operators, multi-provider diversity, and automatic failover so the network remains functional even when centralized infrastructure is pressured or attacked.

---

## Start Here (MVP)

What exists today (MVP):

- Solana program (`ddns_anchor`) that can mint a Passport/TollPass and write/read `.dns` routing state.
- A cache-first resolution model (clients keep local cache and can re-verify on refresh).
- Miners/verifiers can be allowlisted in MVP (receipt verification and aggregation can be off-chain).
- Browser extension is not shipped in MVP (CLI/scripts + services are used).

Quickstart (devnet, minimal proof):

```bash
cd solana
npm install
anchor build
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npm run mint-toll-pass
```

Docs map:

- `docs/MVP.md`
- `docs/ADOPTION.md`
- `docs/PROTOCOL_CACHE_WITNESS.md`
- `docs/END_STATE.md`

Merge order (PR series):

1. PR-DOCS
2. PR-DESIGN3-ONCHAIN
3. PR-MINER-CLIENT
4. PR-DOMAIN-REWARDS-WITNESS
5. PR-OPERATORS

## Devnet Programs (current)

- `ddns_anchor`: `9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes` (Passport mint + route writes)
- `ddns_registry`: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx` (Design 3 canonical routes, PR-DESIGN3-ONCHAIN)
- `ddns_quorum`: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB` (Design 3 quorum, PR-DESIGN3-ONCHAIN)
- `ddns_stake`: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF` (Design 3 stake + rewards, PR-DESIGN3-ONCHAIN)
- `ddns_domain_rewards`: `7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m` (domain owner rewards split per toll event, PR-DOMAIN-REWARDS-WITNESS)
- `ddns_operators`: pending (PR-OPERATORS; not merged/deployed in this docs PR)

Proofs:

- `VERIFIED.md`

## Why

Internet reliability and security are increasingly concentrated in a small number of edge providers (DNS, DDoS absorption, gateways, caching). This creates systemic risk:

- correlated failures during outages or routing incidents
- policy/regulatory pressure concentrated on a few entities
- a trust bottleneck for core internet plumbing

TollDNS aims to reduce reliance on any single provider by funding **distributed, independently operated edge capacity** and making routing decisions **policy-driven and auditable**.

---

## Core Ideas

- **Paid recursive DNS** over **DoH/DoT** with a small toll per query
- **No per-query on-chain transactions**: micropayments use **off-chain vouchers** + batch settlement on an L2
- **User spend escrow** to avoid “click OK for every query” (with spend limits and safety rules)
- **Miner network** provides gateway/caching/ingress and earns based on **proof-of-serving**
- **Regional quotas + diversity constraints** to avoid centralizing into one region/provider
- **Watchdogs + automatic fallback** to centralized services (e.g., Cloudflare/Google) when a backend is unhealthy
- **Composable backends**: integrate existing networks instead of reinventing them
- - **Index Unit** is the usage/toll currency; **native token** is staked for business/dev/miner roles and used for incentives, governance, reserves, grants, and burns

---

## Adoption Wedge: Domain Owners Get Paid

If you control an ICANN domain (like `example.com`) or a `.dns` identity, you can delegate NS/DoH to the network and earn a **% of toll revenue**. This is the mass-adoption wedge: install once, earn continuously.

Users pay toll only on **toll events** (cache misses / route acquisition / refresh), not per raw DNS query. Miners/verifiers do the heavy verification and aggregation work; everyday users get a light cache-first flow.

To resist censorship without tracking users, gateways can emit **privacy-safe witness receipts** (no IP/UA/client identifiers; time-bucketed) that attest only to answer facts. These receipts let independent verifiers audit correctness and strengthen quorum finality over time.

Callout:
- **MVP** uses toll events as the payment surface (centralized gateway + allowlisted miners are acceptable).
- **End state** can incorporate stake-weighted witnesses, slashing, and public receipt batch commitments.

Start here:
- `docs/MVP.md`
- `docs/ADOPTION.md`
- `docs/PROTOCOL_CACHE_WITNESS.md`
- `docs/END_STATE.md`

## MVP vs End Product (Design 3: Cache-as-Witness + Staking)

Protocol + roadmap docs:

- `docs/MVP.md`
- `docs/PROTOCOL_CACHE_WITNESS.md`
- `docs/END_STATE.md`

Miner-first decentralization:

- MVP uses a centralized gateway/tollbooth and allowlisted miners to bootstrap fast routing and quorum updates.
- End-product removes those trust points via decentralized quorum and stake-weighted receipts.
- Everyday users get a lightweight client (cache-first + verify on refresh); miners run the heavy infrastructure (verification, aggregation, feeds).
- A browser extension (Firefox) is not shipped in MVP; MVP uses CLI/scripts and services.

---

## Quick Demo (Devnet)

This is the shortest devnet demo path that exercises real transactions and produces verifiable on-chain proof objects.

```bash
cd solana
npm install
anchor build
```

Then follow `docs/MVP.md` to:

1. Mint a TollPass on devnet (`solana/scripts/mint_toll_pass.ts`)
2. Write a route record on devnet (`solana/scripts/set_route.ts`)

Devnet is the reference environment. Localnet is optional for MVP.

---

---

## Miner Onboarding Path: Docker (Beta) → Pi Firmware → Router Firmware → ASIC Edge Routers

To bootstrap a real, distributed operator base, TollDNS will roll out miners in stages—starting with the easiest possible deployment.

### Phase 1 (Beta) — Miner Docker Stack (Fastest to Ship)

The first miner release will be a **Docker-based stack** that operators can run on existing hardware (VPS, home server, NUC, etc.). This enables:

- rapid iteration during beta,
- easy upgrades/rollback,
- faster onboarding for developers and early operators,
- and real-world performance testing before firmware images are frozen.

### Phase 2 — Reference Miner Firmware (Raspberry Pi + NVMe)

After the Docker beta stabilizes, TollDNS will ship a **reference miner firmware image** targeting affordable, widely available hardware:

- **Raspberry Pi 5 (8GB)**
- **NVMe HAT** + active cooling
- **512GB NVMe** (starter size; scalable)
- “**plug-and-play**” operator experience (flash, boot, register, serve)

We plan to:

- publish the firmware and build instructions (open distribution),
- and optionally offer a **ready-to-run kit** (Pi 5 + case + NVMe HAT + fan + 512GB NVMe).

### Phase 3 — Router Firmware (Open-Source Router Platforms)

Next, we plan to develop firmware/packages for **routers that already run open-source routing software** (e.g., OpenWrt-class devices), enabling:

- **edge ingress (DoH/DoT)**,
- **local caching**, and
- **policy-compliant routing**,
without requiring separate dedicated hardware.

### Phase 4 — Purpose-Built “ASIC Router” Miner Appliances (Edge Devices)

Longer-term, the network can support miners that are **purpose-built edge/router appliances** designed specifically for TollDNS workloads (ingress, routing, caching, and high-throughput policy enforcement), optimizing:

- packet processing and handshake handling,
- sustained throughput under load,
- power efficiency,
- and predictable edge performance.

## Docs (Prospectus)

Start here:

- [Resolution backends (what we integrate and why)](docs/02-resolution-backends.md)
- [Watchdogs + automatic fallback (immutable policy + verifiable health)](docs/03-watchdogs-and-fallback.md)
- [Functional equivalence proofs (how we decide “backend matches reference behavior”)](docs/04-functional-equivalence-proofs.md)

Tokenomics:

- [Tokenomics (escrow vs governance stake, payouts)](docs/05-tokenomics.md)

Optional supporting docs (add/expand over time):

- [Raspberry Pi miner reference stack (ports, NVMe, GUI, rewards gating)](docs/raspi-miner.md)
- [Resilience tokenomics (anycast/edges/scrubbing)](docs/06-resilience-tokenomics.md)
- [Routing engine](docs/07-routing-engine.md)
- [Flow diagrams (Mermaid)](docs/flow-diagram.md)
- [Threat model](docs/08-threat-model.md)
- [Roadmap](docs/09-roadmap.md)

---

## Developer Tools: Bring-Your-Own Gateway (Extensible Ecosystem)

TollDNS will include **developer tooling** that allows third parties to register and operate their own **gateways / resolution adapters** (e.g., additional Web3 name systems, content networks, specialized retrieval layers). This expands the ecosystem without requiring the core project to build every integration in-house.

### What Developers Can Do

- Build and publish a **Gateway Adapter** that implements the TollDNS backend interface
- Submit that adapter for inclusion (DAO-governed)
- Operate gateway capacity and earn based on **proof-of-serving**, performance, and correctness

### Gateway Listing Fee + Revenue Potential

Gateway providers may pay an **initial listing fee** to have their gateway considered for inclusion in the TollDNS routing set.

After listing, gateways can earn ongoing revenue:

- When TollDNS routes traffic through a third-party gateway, that gateway can receive a **share of toll revenue** associated with that routed traffic.
- If enough tolls are collected from traffic routed through the gateway, the operator can potentially earn **more than the initial listing fee** (i.e., operate profitably).
- Payouts are based on measurable delivered service (successful requests/bytes served), plus correctness and SLO performance — not merely on being listed.

> Fee splits and payout formulas are governed by DAO policy and can vary by gateway type, region, and network conditions.

---

## Governance Stake (No “Refundable Escrow Staking”)

TollDNS uses escrow for **user spending** (prepaying tolls), but **stake for security/accountability must not be instantly withdrawable**.

We explicitly avoid “refundable escrow staking” because it can be abused if a provider can:

1) post stake,
2) behave exploitively,
3) withdraw stake quickly before consequences apply.

Instead, staking (when used) is only permitted in forms that reduce or eliminate this abuse class:

- **DAO Governance Stake Pool** with a **minimum lock/freeze period** (e.g., 30 days)
- **Cooling-off exit**: withdrawals become claimable only after a delay window
- Optional later: **slashable stake** for provable violations (governance-defined)

See: [docs/05-tokenomics.md](docs/05-tokenomics.md)

---

## DAO Governance: Curated Backends and Gateways

All gateways/backends integrated into the TollDNS routing set are governed by a DAO process that can:

- approve or reject new adapters
- define conformance profiles and watchdog thresholds
- assign routing weights / quotas / region buckets
- pause, degrade, or delist a gateway/backend that violates policy or becomes unsafe/unreliable

---

## Hosted Gateways + Policy Enforcement (Safety + Compliance)

TollDNS is designed to provide reliable gateway infrastructure. In early phases (and potentially long-term), TollDNS will operate and/or coordinate **hosted gateway infrastructure** to ensure:

- predictable performance
- consistent policy enforcement
- the ability to **delist** gateways/backends that facilitate clearly illegal activity

### Content Policy Intent (High-Level)

TollDNS gateways are not intended to route or cache content that is clearly unlawful or primarily infringing, including:

- piracy / large-scale copyright infringement distribution
- malware distribution or phishing kits

Some privacy-preserving access methods may be permitted where lawful and aligned with governance policy (e.g., Tor gateway support), but will be subject to DAO-approved rules and operational constraints.

### Auditing Model

Enforcement may include:

- **DAO governance auditing**
- both **human review workflows** and **automated AI crawler checks**
- the ability to **delist** or disable gateways/backends that violate policy or present unacceptable risk

> Policy and enforcement details will be refined and expressed as transparent governance rules and watchdog criteria.

---

## Ecosystem Integrations (Clickable Links)

TollDNS is designed to reuse proven networks and protocols.

### Naming / Resolution

- ENS: <https://github.com/ensdomains>
- Solana Name Service / Bonfida (.sol): <https://github.com/Bonfida>  
  SNS SDK: <https://github.com/SolanaNameService/sns-sdk>
- Unstoppable Domains Resolution: <https://github.com/unstoppabledomains/resolution>
- Handshake (alt-root / TLD): <https://github.com/handshake-org>  
  hnsd resolver: <https://github.com/handshake-org/hnsd>
- PKDNS (DHT-backed DNS server): <https://github.com/pubky/pkdns>  
  PKARR (signed packets to DHT): <https://github.com/pubky/pkarr>

### Content / Storage (Gateways)

- IPFS: <https://github.com/ipfs>
- Filecoin: <https://github.com/filecoin-project>
- Arweave: <https://github.com/arweaveteam>

---

## Status

Early concept / design notes. Expect iteration.

---

## Local Architecture Loop (Docker Compose)

A lightweight `docker-compose.yml` is included to bring up a stubbed end-to-end loop:
resolver (DoH/DoT endpoint), RRset cache, upstream quorum module, policy client, and a receipt writer.

Start the stack:

```
docker compose up --build
```

Exercise a sample DoH request:

```
curl "http://localhost:8053/resolve?name=example.com"
```

Set `RECEIPT_SECRET` in the receipt-stub service environment if you want deterministic receipt signatures.

The DoT stub listens on TCP port `8853` and simply echoes a stub response (no TLS in the stub).

## Contributing

High-impact areas:

- voucher + escrow settlement mechanics
- governance stake pool design (locks, exits, slashing rules)
- miner scoring and anti-centralization incentives
- watchdog attestation formats + policy state machine
- adapters (ENS/SNS/Handshake/PKDNS/IPFS/Filecoin/Arweave)
- threat modeling and “attack mode” degradation strategies
