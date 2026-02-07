# TollDNS / DECENTRALIZED-DNS — Prospectus (Developer + Partner Version)

Repo: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS is a concept for a **decentralized Cloudflare-like edge fabric** that starts with **paid recursive DNS (DoH/DoT)** and expands into a distributed network of **edge ingress + caching + gateways + minimal hosting** operated by independent “miners” (operators).

The core wedge is simple:
- a small **toll per DNS query** (priced in a stable Index Unit) funds infrastructure and makes many abuse patterns economically costly,
- while the network stays survivable via **watchdogs + automatic fallback** and long-term via **multi-operator diversity**.

This prospectus is intended for:
- developers who want to build the MVP and operator stack, and
- partner protocols/infrastructure providers who want to integrate and co-develop.

---

## 1) What We’re Building

### A) Paid Recursive DNS (DoH/DoT)
A resolver network that:
- resolves standard ICANN domains immediately,
- integrates Web3 namespaces over time (ENS/SNS/Handshake/PKDNS/etc.),
- routes gateway traffic for content-addressed systems (IPFS/Filecoin/Arweave),
- supports policy-driven routing and automatic fallback.

### B) A Decentralized Gateway Network (Our Gateway + Partner Gateways)
A routing layer that:
- maps names/pointers → best gateway routes (performance + correctness + policy),
- provides a “default gateway” experience that can be free/subsidized,
- supports third-party gateway operators who can earn revenue when traffic routes through them.

### C) Minimal Edge Hosting + Workers (Cloudflare-like)
A practical “Cloudflare-like” offering:
- **free/cheap static hosting** for normal users and simple sites,
- Workers-style edge compute for forms/webhooks/automation and “mini backends,”
- an “AI convert to static” path to reduce CMS/plugin complexity.

### D) Domain + Gateway Services (Distribution Channel)
A growth and distribution channel:
- a domain service path (subdomains early, registrar later),
- a branded gateway domain/namespace concept (e.g., `.strong` style idea or subdomains under ICANN),
- crypto-friendly domain renewal lock-in concepts (multi-year) as a differentiator.

### E) Miners = Hosters = Edge
Miners are not only “providers.” They are the product:
- **edge ingress**
- **cache**
- **gateway**
- and optionally **static host**

Bootstrapping requires a miner/operator stack that is easy to deploy and maintain.

---

## 2) Why This Exists

Internet reliability and security are increasingly concentrated in a small number of edge providers (DNS, DDoS absorption, gateways, caching). That concentration creates systemic risk:
- correlated failures during outages and routing incidents,
- policy/regulatory pressure concentrated on a few entities,
- trust bottlenecks for DNS and edge delivery.

TollDNS aims to reduce reliance on any single provider by funding **distributed, independently operated edge capacity** with **auditable policy routing** and **automatic fallback**.

---

## 3) Economic Model (Two-Asset Philosophy)

### Index Units (Usage / Tolls)
- Usage is priced in a stable **Index Unit** (not the native token).
- Users pre-fund spend via escrow; payments happen via **off-chain vouchers** + batch settlement (no per-query on-chain tx).
- This avoids “click OK for every query.”

### Native Token (Everything Else)
The native token is used for:
- governance and DAO reserves,
- operator/miner rewards (proof-of-serving),
- gateway/adapter integration fees and incentives,
- grants, bug bounties, community ops,
- long-term hardware programs and potential ISP/DePIN expansion.

Native token is **not** the toll unit.

---

## 4) Reliability & Safety: Watchdogs + Automatic Fallback

Before decentralization claims matter, the system must be resilient:
- verifiers probe health/correctness and submit signed reports,
- an immutable policy state machine computes backend states:
  - HEALTHY / DEGRADED / DISABLED / RECOVERING,
- routing policy updates are on-chain/auditable,
- if decentralized backends degrade, routing falls back to centralized upstreams (Cloudflare/Google/etc.) until recovered.

This is the circuit breaker that makes the system survivable during incidents and attacks.

---

## 5) Adoption Strategy: Replace Things People Already Pay For

To reach mass adoption, the network must offer immediate value:
- plugin-free form handling (Workers + connectors),
- webhook routing to Slack/Trello/Zapier/Make/Notion/CRMs,
- email/MX assist and **free starter webmail** when users have no mail,
- free static hosting for simple sites,
- Web3 resolution + gateway routing baked into DNS,
- consumer apps (iOS/Android/macOS/Windows) and browser extensions.

The goal is a product that feels like:
> DNS + Workers + hosting + gateway routing + security… with decentralized resilience.

---

## 6) Secure-by-Default Bundle: Free Web Email + Secure Hosting + Checkups + LLM Editor (Alpha)

A major adoption wedge is a consumer-friendly bundle:
- **free web email** (starter tier; simple and predictable),
- **secure static hosting + Workers**,
- automated **security and functionality checkups**,
- an **LLM-powered site editor** (alpha) so normal users can edit and publish without being developers.

### Why Static + Workers Is Better
Static hosting + Workers is often more reliable and secure than plugin-heavy CMS stacks:
- fewer moving parts and lower operational risk,
- reduced attack surface (no always-on database + fewer plugin chains),
- straightforward caching and edge distribution,
- fewer upgrade/compatibility failures.

This positions TollDNS as a “safer default internet stack” for normal users.

---

## 7) Consumer Adoption Flywheel: Free Hosting + Plugin → Background Edge Node

TollDNS can lead with free benefits:
- free static hosting,
- browser plugin (Web3 resolution + login/SSO helpers + site tools),
- simple automations (forms → Slack/Trello/Zapier/etc.),
- secure checkups and alerts.

Over time, users can opt into a **lightweight background service** (desktop/router/mobile where possible) that contributes edge capacity:
- caching assistance (RRsets and validated routes),
- policy-compliant gateway routing assistance,
- optional lightweight probing/telemetry (privacy-preserving).

This is a sustainable loop:
> free benefits → user trust → opt-in contribution → stronger edge → better free benefits.

Constraints:
- opt-in, transparent, easy to disable,
- strict CPU/RAM/bandwidth caps,
- not a generic proxy product by default,
- no raw query logs by default.

---

## 8) Hardware Strategy: Docker → Pi Firmware → Router Firmware → ASIC Edge Routers

### Phase 1 (Beta): Miner Docker Stack (Fastest to Ship)
The first miner release is a **Docker-based stack** so operators can join quickly on:
- VPS/dedicated servers,
- home labs/NUCs,
- existing Linux hosts.

Why Docker first:
- fastest onboarding,
- rapid iteration/rollback during beta,
- reproducible deployments.

Docker stack targets:
- edge ingress (DoH/DoT + admission gating),
- caching (RRsets + validated routes),
- optional gateways (IPFS/Filecoin/Arweave routing),
- operator agent (registration, keys, receipts),
- bucketed telemetry exporter.

### Phase 2: Reference Miner Firmware (Raspberry Pi 5 + NVMe)
After Docker stabilizes:
- Raspberry Pi 5 (8GB) + NVMe HAT + cooling + 512GB NVMe starter.
Optional kit:
- Pi + case + NVMe HAT + fan/heatsink + NVMe.

### Phase 3: Router Firmware (Open-Source Router Platforms)
Firmware/packages for routers running open-source routing software (OpenWrt-class):
- secure DNS ingress + caching by default,
- policy enforcement,
- constrained roles to match hardware limits.

### Phase 4: Purpose-Built “ASIC Router” Miners
Long-term, purpose-built edge/router appliances optimized for:
- sustained throughput under incident load,
- fast policy enforcement,
- predictable edge performance per watt.

---

## 9) Consumer Hardware Program: ISP Subsidies (Instead of “Crypto Mining”)

To accelerate adoption and retention, TollDNS can ship consumer hardware (router/mesh/3-in-1 modem+router Wi-Fi 7) with a clear value proposition:

> **ISP bill subsidies** (e.g., $10–$30/month; parameterized)

This is easier for normal users to understand than “mining returns,” and helps:
- keep secure DNS enabled by default,
- create a managed, policy-compliant edge footprint,
- improve caching and resilience at the network edge.

Funding sources (DAO-parameterized):
- share of Index Unit revenue,
- native token incentive budgets,
- partner programs.

Anti-abuse:
- strict role profiles for consumer devices,
- optional backhaul partner routes for certain contribution types to avoid ISP-proxy misuse,
- device health/attestation where feasible.

---

## 10) Partner Strategy: Integrate, Don’t Reinvent

TollDNS is designed to reuse proven networks and protocols through adapters:
- ENS: https://github.com/ensdomains
- Solana SNS/Bonfida: https://github.com/Bonfida and https://github.com/SolanaNameService/sns-sdk
- Unstoppable: https://github.com/unstoppabledomains/resolution
- Handshake: https://github.com/handshake-org and https://github.com/handshake-org/hnsd
- PKDNS/PKARR: https://github.com/pubky/pkdns and https://github.com/pubky/pkarr
- IPFS: https://github.com/ipfs
- Filecoin: https://github.com/filecoin-project
- Arweave: https://github.com/arweaveteam

Integration model:
- standard backend adapter interface,
- conformance profiles for correctness surfaces,
- watchdog health + policy state machine decides routing and fallback.

---

## 11) MVP Shipping Plan (Fast Path)

### Priority 1: Docker Miner Stack (Beta)
Because miners must be hosters and edge.

### Priority 2: Testnet Deployments Early
Deploy basic functionality to testnets early to validate:
- voucher accounting + batch settlement,
- receipts and payouts,
- watchdog → policy updates,
- backend registry and adapter listing flows.

### Priority 3: “Our Gateway” + Domains + Minimal Hosting
Adoption requires:
- a default gateway experience,
- domain/subdomain onboarding path,
- minimal hosting that feels safer than CMS stacks.

### Priority 4: Consumer Apps + Extensions
Apps make it easy:
- secure DNS enablement,
- escrow spend limits,
- web3 resolution preferences,
- LLM site editing and checkups UX.

---

## 12) What We Need Help With (Call to Action)

### For Developers
We want contributors to build:
- Docker miner stack (first operator onboarding)
- DoH/DoT resolver + caching + routing policy consumption
- receipts + batch settlement + reward distribution
- gateway routing + caching + safety controls
- Workers runtime + connectors framework
- static hosting platform and LLM site editor (alpha)
- webmail starter tier and security/functionality checkups pipeline
- watchdog verifiers and conformance harnesses

### For Protocol Partners
We want partners for:
- adapter integrations and correctness surfaces,
- gateway routing and integrity verification,
- reliability and incident response co-design,
- edge presence and scrubbing partnerships,
- router/hardware partnerships.

---

## 13) Where to Start in This Repo

High-level docs:
- Vision: `docs/00-vision.md`
- Architecture: `docs/01-architecture-overview.md`
- Backends: `docs/02-resolution-backends.md`
- Watchdogs: `docs/03-watchdogs-and-fallback.md`
- Equivalence: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Resilience incentives: `docs/06-resilience-tokenomics.md`
- Routing: `docs/07-routing-engine.md`
- Threat model: `docs/08-threat-model.md`
- Roadmap: `docs/09-roadmap.md`
- Adoption: `docs/10-adoption-and-product-strategy.md`
- Workers: `docs/11-workers-and-edge-compute.md`
- Domains: `docs/12-domain-services-and-registrar.md`
- Clients: `docs/13-client-apps-and-extensions.md`

Specs:
- Backend interface: `specs/backend-interface.md`
- Health reports: `specs/health-report-format.md`
- Receipts: `specs/receipt-format.md`
- Policy state machine: `specs/policy-state-machine.md`

Operational modules:
- Adapters: `/adapters`
- Miner: `/miner`
- Resolver: `/resolver`
- Watchdogs: `/watchdogs`
- Client: `/client`
- Contracts plan: `/contracts`

---

## 14) Next Steps / Contact

If you want to collaborate:
- open an issue with the area you want to work on,
- propose an adapter or gateway integration,
- propose a minimal testnet deployment target.

Fastest path to value:
1) ship the Docker miner stack,
2) deploy minimal policy + settlement loop to a testnet,
3) launch a default gateway + minimal static hosting + free email starter tier,
4) convert users to opt-in background edge nodes over time.

---
