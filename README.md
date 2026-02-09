# DECENTRALIZED-DNS (TollDNS) — A Decentralized “Cloudflare-Like” Resolver + Gateway Network

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

- 📄 Prospectus: `PROSPECTUS.md`

### Status (MVP)

- Devnet: reference environment for MVP demos. See `docs/MVP.md`, `docs/PR1_VERIFIED.md`, and `solana/VERIFIED.md` (once PR2 is merged).
- Localnet: optional for MVP. Some machines hit `solana-test-validator` genesis/ledger issues; use Docker-based localnet where needed (see `docs/LOCAL_DEV.md`).
- Centralization points (explicit in MVP):
  - allowlisted miner/verifier submitters
  - gateway/tollbooth services (clients verify on-chain and keep local cache).

### Security Posture: Attack Mode (PR series)

Attack Mode is a resilience layer being added via a PR series to make the system degrade safely under active adversaries.

- It can freeze writes, clamp TTL, and raise verification thresholds under attack.
- It adds multi-RPC disagreement guards (refuse writes when sources diverge).
- It can require stake/passport gating for higher-risk submissions.
- Enable/disable via environment variables (documented in PR-A).
- New endpoints (land in PR-C/PR-D): `GET /v1/attack-mode` on gateway/tollbooth/miner.

### How To Review The Attack Mode PR Series

Merge order:
- PR-A: docs (threat model + attack mode rules)
- PR-B: shared attack-mode module + tests
- PR-C: miner integration
- PR-D: gateway + tollbooth integration
- PR-E: client scripts integration

See: `docs/REVIEW_CHECKLIST_ATTACK_MODE.md` (reviewer checklist) and `docs/INDEX.md` (docs map).

TollDNS is a concept for a **decentralized cloud-edge fabric** built around a **paid recursive DNS** (DoH/DoT) and an extensible network of **gateway + caching + ingress** operators (“miners”). A small **toll per query** funds infrastructure and makes abusive query patterns economically costly.

The long-term goal is a “decentralized Cloudflare”: many independent operators, multi-provider diversity, and automatic failover so the network remains functional even when centralized infrastructure is pressured or attacked.

---

## Start Here

### MVP Status (What Works Today)

Live/working on Solana **devnet** today:

- Passport/TollPass NFT mint + on-chain identity PDA (`ddns_anchor`)
- Route submission with witness quorum checks (centralized bootstrap service): `services/toll-booth`
- On-chain route record write for a `.dns` name (current MVP): `create_name_record` / `update_name_record` in `ddns_anchor`

Also shipped (MVP building blocks for Design 3):

- On-chain programs deployed to devnet: `ddns_registry`, `ddns_quorum`, `ddns_stake`
- Localnet test proving: stake -> claim -> submit aggregate -> finalize canonical route via CPI

Not shipped yet (explicit):

- Browser extension (Firefox)
- Miner witness daemon + receipt batching CLI (PR3)
- Trustless on-chain receipt verification (future; receipts verified off-chain in MVP)

### End-State (Planned, Not Implemented Yet)

- Cache-as-Witness: stake-weighted receipts drive canonical route changes via quorum
- Miners-first decentralization: miners run heavy verification/aggregation; everyday users run a lightweight cache-first client
- DYDNS per NFT + IPFS cache snapshots (future; documented only)

### Architecture At A Glance

- Wallet / client (later: Firefox extension) maintains a local cache and emits receipts after verified resolves
- Gateway / tollbooth provides fast resolution and convenience writes (centralized in MVP bootstrap)
- Miners/verifiers collect receipts, verify off-chain, aggregate, and submit quorum updates
- Solana programs store verifiable truth (identity, route records, canonical routes, stake/rewards)
- Clients never have to trust a gateway: proofs are on-chain (PDA accounts) and locally cacheable

### Proofs / Hashes (What “Verifiable” Means)

Example (deterministic):

- `name = "example.dns"`
- `name_hash = sha256(utf8(name)) = 8e01…dfa8`
- `dest = "https://example.com"`
- `dest_hash = sha256(utf8(dest)) = 1006…9ce9`

In Design 3, the canonical proof is the on-chain PDA `["canonical", name_hash]` owned by `ddns_registry`.

Verified MVP example on devnet (2026-02-09):

- TollPass mint tx: `4JFCsqiMwPZ5exhMvcSfXueuwBRXMVRM1QAb4soTncTrR7qmnBoRuC5nWNn6HJd68MKPW1YtAv2CzT8fEDGBjaUy`
- Route write tx: `2uWiHYhNBwMU9cqwGsrgYd9XoAjrVAWA9n1fartoQb5UQrpLewBY9wFLnCAzN2DWVssuiPFd7HbeFkMGHPyqGLRE`
- NameRecord PDA (ddns_anchor): `9uK735cEkShaWjXw96tMVgWY4dtTT1e9cxzwEt7dr3N8`
- `name_hash`: `32e1…e3d7` and `dest_hash`: `1006…9ce9`

### Docs Map

- `docs/README.md` (index)
- `docs/MVP.md`
- `docs/PROTOCOL_CACHE_WITNESS.md`
- `docs/END_STATE.md`
- `solana/README.md` (on-chain programs + scripts)

### What This Repo Contains

- `solana/`: Anchor workspace (programs + scripts)
- `services/toll-booth/`: MVP tollbooth verifier service (witness quorum + on-chain toll pass check)
- `gateway/`, `resolver/`, `core/`, `plugins/`, `adapters/`: resolver/gateway and backend integration surfaces (concept + WIP)

---

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
