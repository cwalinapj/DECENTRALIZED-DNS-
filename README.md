# DECENTRALIZED-DNS (TollDNS) — A Decentralized “Cloudflare-Like” Resolver + Gateway Network

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

- 📄 Prospectus: `PROSPECTUS.md`
- Docs index: `docs/INDEX.md` and `docs/README.md`

## Start Here (MVP)

- What exists today (MVP): `docs/MVP.md`
- Adoption wedge (why this gets used): `docs/ADOPTION.md`
- Mass adoption roadmap (Web2-first): `docs/MASS_ADOPTION_ROADMAP.md`
- How it works (protocol): `docs/PROTOCOL_CACHE_WITNESS.md`
- Where it’s going (end state): `docs/END_STATE.md`
- Adapter layer (PKDNS/IPFS/ENS/SNS): `docs/ADAPTERS.md`
- Watchdogs + policy attestation formats: `docs/PROTOCOL_WATCHDOG_ATTESTATION.md`
- Security: `docs/THREAT_MODEL.md` and `docs/ATTACK_MODE.md`
- Merge guardrails + queue: `docs/MERGE_QUEUE.md` and `docs/MERGE_LOG.md`

### Mass Adoption Roadmap (Web2-First, Web3-Backed)

- Phase 0 (MVP): fast recursive ICANN DNS + `.dns` PKDNS + privacy-safe observation aggregation.
- Phase 1 wedge: registrar + DNS protection + free hosting + AI/manual site builder UX.
- Phase 2 identity: human-readable `.dns` identities with safe defaults (non-transferable by default).
- Phase 3 scarcity: premium short-name auctions (`3-4` first, `1-2` treasury-reserved in MVP).
- Planned ops layer: workers for backups/audits with proof-backed attestations.

Details: `docs/MASS_ADOPTION_ROADMAP.md` and `docs/DEVELOPER_API.md`.

### Adoption Wedge: Domain Owners Get Paid

Domain owners can delegate NS/DoH to the network and earn a **% of toll-event revenue**. This is the mass-adoption wedge: install once, earn continuously.

- MVP payouts are based on **toll events** (cache miss / route acquisition / refresh), not raw DNS query counts.
- To resist censorship without tracking users, gateways can emit **privacy-safe witness receipts** (no IP/UA/client identifiers; time-bucketed) that attest only to answer facts.
- End-state can incorporate stake-weighted witnesses + slashing and public receipt batch commitments.

### Miner Rewards (MVP)

- Miners earn **REP** (reputation points) now; REP is anti-sybil gated (bond + caps + diversity + cooldown).
- **TOLL** is utility: toll payments and protocol settlement flows.
- No free permissionless TOLL emissions in MVP (prevents low-cost cloud sybil farming).

### Status (MVP)

- Devnet: reference environment for MVP demos. See `docs/STATUS.md` and `solana/VERIFIED.md`.
- Localnet: optional. Some machines hit `solana-test-validator` genesis/ledger issues; see `docs/LOCAL_DEV.md`.
- Centralization points (explicit in MVP bootstrap):
  - allowlisted miner/verifier submitters
  - gateway/tollbooth services (clients verify on-chain and keep local cache).

### Quick Verify (Devnet)

```bash
solana program show -u devnet 5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx
solana program show -u devnet 9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB
solana program show -u devnet 6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF
```

See `solana/VERIFIED.md` for the full command log and tx signatures.

### Security Posture: Attack Mode

Attack Mode is a resilience layer that makes the system degrade safely under active adversaries.

- Freeze writes, clamp TTL, raise verification thresholds.
- Multi-RPC disagreement guards (refuse writes when sources diverge).
- Endpoints: `GET /v1/attack-mode` on gateway/tollbooth/miner.
- Review checklist: `docs/REVIEW_CHECKLIST_ATTACK_MODE.md`.

### PR Merge Order (Do Not Mix)

1. PR1: docs
2. PR2: on-chain programs
3. PR3: miner + client

### Auto-merge Policy

- Auto-merge is executed by `scripts/automerge_prs.sh` (zero human approval flow).
- A PR is eligible only with label `automerge-ok`, `Risk: Low`, required checklist, green CI, and passing local-equivalent checks.
- See `MERGE_QUEUE.md`, `MERGE_GUARDRAILS.md`, and `MERGE_LOG.md`.

### How Merges Happen

- Codex runs one PR at a time via `scripts/merge_prs_one_by_one.sh` in isolated worktrees.
- CI must be green on both the PR and `main` before anything is marked ready.
- No automatic merge by default: script stops at `READY TO MERGE`.
- Override is explicit only via `OVERRIDE_MERGE_OK` token.
- Queue + run logs: `docs/MERGE_QUEUE.md` and `docs/MERGE_LOG.md`.

### What This Repo Contains

- `solana/`: Anchor workspace (programs + scripts)
- `services/`: MVP services (tollbooth, miner, gateway components)
- `gateway/`: DoH/gateway + adapter layer
- `docs/`: specs, roadmap, and operational notes

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
- **Index Unit** is the usage/toll currency; **native token** is staked for business/dev/miner roles and used for incentives, governance, reserves, grants, and burns

## Devnet Beta: Mint Passport + Assign Route + Resolve

This is the MVP flow for `.dns` names using the Solana Anchor program + a local Tollbooth service.

### 1) Build + Deploy Program to Devnet
```bash
npm -C solana install
npm -C solana run deploy:devnet
```

### 2) Run Tollbooth (Local)
```bash
npm -C services/tollbooth install
npm -C services/tollbooth run dev
```

### 3) End-to-End Flow (Local Client, Devnet Writes)
This script creates a test client keypair, mints a passport for it, assigns a route, and resolves it.

```bash
solana-keygen new --no-bip39-passphrase -o services/tollbooth/config/test-client.json -f
npm -C services/tollbooth run flow:devnet
```

---

## MVP vs End Product (Design 3: Cache-as-Witness + Staking)

Protocol + roadmap docs:

- `docs/MVP.md`
- `docs/PROTOCOL_CACHE_WITNESS.md`
- `docs/PROTOCOL_WITNESS_RECEIPT.md`
- `docs/PROTOCOL_CACHE_LOG_V1.md`
- `docs/END_STATE.md`

Miner-first decentralization:

- MVP uses a centralized gateway/tollbooth and allowlisted miners to bootstrap fast routing and quorum updates.
- End-product removes those trust points via decentralized quorum and stake-weighted receipts.
- Miners earn REP now; TOLL remains utility until stronger anti-sybil primitives are live.
- End-state also includes Nameserver Delegation Incentives for ICANN domains (usage-based rewards in TOLL; not in MVP).
- Premium `.dns` parents can run chronological cache rollups:
  - gateway emits privacy-safe `CacheEntryV1` observations (RRset-only; no client identifiers)
  - rollups are published to IPFS and anchored on-chain via `ddns_cache_head`
  - accepted contributors accrue non-transferable REP (`ddns_rep`) for useful cache contribution
- Everyday users get a lightweight client (cache-first + verify on refresh); miners run the heavy infrastructure (verification, aggregation, feeds).
- (Optional) ICANN domain incentives: domain owners can claim a revenue share in TOLL for NS adoption (MVP uses centralized verification; end-state moves to verifier/oracle attestations).
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

## .dns Identity + Premium Reward Gate (MVP)

- Every wallet can claim identity subdomains under a controlled parent zone: `label.user.dns`.
- `user.dns` subdomains are non-transferable by default (identity-first, not resale inventory).
- Premium second-level names (for example `alice.dns`) are one-time SOL purchases and remain transferable.
- Premium parent owners can mint delegated subdomains (for example `bob.alice.dns`) with parent-controlled transfer rules.
- Sellable miner reward claims are premium-gated: claimants must prove ownership of a premium `.dns` account.
- This gate changes reward eligibility only; it does not write ICANN results into canonical `.dns` consensus.

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
