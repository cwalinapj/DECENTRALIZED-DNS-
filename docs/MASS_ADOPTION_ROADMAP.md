# Mass Adoption Roadmap: Web2-First, Web3-Backed

This project is a toll-road DNS designed for users who are not Web3-literate. MVP prioritizes speed, reliability, and low confusion UX, while on-chain proofs align incentives and reduce capture risk.

## Phase 0 (MVP): Usable Today
- Recursive DNS for ICANN names (`netflix.com`, `google.com`, etc.) using multi-upstream DoH quorum + TTL caching.
- PKDNS for `.dns` names: structured cache-first resolution for opt-in names.
- Privacy-safe observations strengthen reliability without user identifiers (no IP/MAC tracking; only hashed/normalized aggregates).

## Phase 1: Adoption Wedge (Registrar + DNS + Hosting)
- Cheaper ICANN registration/renewals when domains keep DDNS nameservers set (verified policy path).
- Free static hosting up to 5 pages with:
  - AI site builder (prompt -> site)
  - manual editor (full control)
  - export/import (no lock-in)
- Cloudflare-style DNS security/performance defaults, but incentive-aligned with users/operators.

Why this matters: users do not switch because something is decentralized. They switch because it is cheaper, faster, and bundled with products they already pay for.

## Phase 2: `.dns` Identity Layer
- Free default subdomain identity (for example `alice.<root>.dns`).
- Premium primary `.dns` option (on-chain ownership).
- Subdomains are non-transferable by default (anti-flip / anti-squat default).
- Premium primary owners can optionally enable sellable delegated subdomains under their root.

## Phase 3: Premium Domain Allocation
- Treasury controls all `1-2` character `.dns` names in MVP.
- `3-4` character premium primaries are allocated through on-chain auctions.
- Later: treasury can auction `1-2` character names when abuse controls mature.

## Why TOLL Can Be Valuable (Beyond “DNS Fees”)

Demand sinks:
1. Premium primary `.dns` purchases (auction/ownership paths).
2. Miner eligibility bonds for sellable reward tiers.
3. NS/DoH operator rewards for verified performance + usage.
4. Optional registrar discounts funded by toll flows.

Earning loops:
- Users/subdomains contribute privacy-safe observations to strengthen cache reliability.
- Premium subtree operators can earn more from useful contribution and performance (policy-controlled).
- Later: hosting/CDN operators earn for proof-backed service.

## REP as Anti-Sybil Gate
- REP accrues from verified work (correctness, uptime, useful participation).
- REP gates higher earning tiers and capability unlocks.
- REP reduces low-cost multi-wallet/proxy farm abuse.

## Why Developers Choose This
- Consistent JSON resolution API (not raw DNS parsing burden).
- Confidence and upstream audit metadata in answers.
- Adapter proofs where applicable (`.dns`, IPFS, ENS, SNS).
- Privacy-safe reliability improvements over time.
- Policy-based monetization upside for projects that keep DDNS nameservers.

## Autonomous Website Ops (Planned)

### A) Daily Backups to IPFS + On-Chain Proof
- Workers snapshot eligible sites (MVP: static export/public content paths).
- Artifacts publish to IPFS (CID).
- On-chain proof record includes:
  - site identifier (`domain` or `name_hash`)
  - CID
  - timestamp bucket
  - worker attestation signature
  - optional batch Merkle root

### B) Continuous Site Health/Security Audits + Attestations
- Workers run daily checks (configurable):
  - critical flow probes (login/checkout/contact)
  - security baseline checks (TLS/headers/basic vuln surface)
  - performance checks (load time/TTFB, multi-region)
- Results are normalized + hashed.
- On-chain attestation stores:
  - domain/name hash
  - audit type + version
  - time bucket
  - result hash (optional compact score vector)
  - worker signature + stake/bond reference
- MVP language: model-assisted heuristics, not a full formal security audit.

### C) Incentives + Compute Supply
- Premium `.dns` holders can opt-in to run sandboxed worker tasks.
- Rewards are tied to verified backup/audit/perf attestation output.
- Anti-gaming path:
  - bond/stake requirement
  - random challenge tasks
  - cross-checking between workers
  - slashing/penalties for false attestations (future hardening)
- Privacy posture:
  - no end-user IP/MAC/identity collection
  - synthetic probes only

## Go-To-Market Ladder
1. Start: free subdomain + free hosting + fast cached DNS.
2. Next: white-label registrar + nameserver-based toll rebates.
3. Next: permissionless hosting/operators + REP/reward tiers.
4. Later: ICANN registrar status + decentralized CDN/hosting market.

## Bridge to Web3 Ecosystem
- DDNS is a Web2-shaped entry point (familiar domain UX) backed by on-chain proofs and programmable incentives.
- Web3-native systems (IPFS/Filecoin/Arweave/ENS/SNS/Handshake) integrate via adapters and shared attestation/proof formats.
- Integrations are modular: no need to replace existing systems to interoperate.

## Compliance and Claims
- We are not an ICANN registrar today.
- Phase 1 is white-label registrar integration; registrar status is a later phase.
- Rebates/credits are policy-controlled and not guaranteed yield promises.
