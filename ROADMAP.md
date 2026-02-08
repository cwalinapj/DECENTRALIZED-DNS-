# ROADMAP

This roadmap covers the core ecosystem:
- **DECENTRALIZED-DNS-** (name gateway + adapters + registry/proofs + credits + node-agent)
- **Origin-Web3-Wallet** (identity, vault, protected mode, mining wallet UI)
- **TollEmail** (SMTP gateway + forwarding + toll anti-spam) — to live in its own repo

Guiding principles:
- **Ship MVPs that users feel immediately** (WordPress + wallet + simple gateway).
- Keep the **hot path simple** (cache + verify), push heavy analysis to offline/batch.
- Prefer **Solana for cheap interactions** (credits/tolls later), **EVM/L2 for anchoring and stable identity** (passport + checkpoints).
- Treat security/abuse as product features, not afterthoughts.


---

## Milestone 0 — Repo hygiene and baseline (now)

### Deliverables
- Add missing top-level docs:
  - `ROADMAP.md` (this file)
  - `ARCHITECTURE.md` (high-level components)
  - `CONTRIBUTING.md` (how to run tests and dev environment)
- CI basics:
  - `npm test`, `cargo test`, and lint where applicable
- Standardize environment configs:
  - `.env.example` for each service
  - consistent ports and docker-compose dev paths

### Exit criteria
- New contributor can clone and run `dev.sh` + tests without tribal knowledge.


---

## Milestone 1 — DNS Gateway MVP (foundation)

### Goals
- Make `/resolve` reliable, fast, and verifiable.
- Establish a clean adapter interface and caching.

### Deliverables
- `/resolve` API with:
  - caching + timeouts
  - JSON schema validation for output
  - consistent normalization rules (lowercase, punycode, trim trailing dot)
- Adapters:
  - ICANN (via DoH)
  - ENS adapter
  - SNS adapter (Solana Name Service)
  - Handshake adapter (optional after ENS/SNS)
- Registry/proof:
  - deterministic Merkle root build
  - `proof=1` returns verifiable proof bundle

### Exit criteria
- `/resolve` returns consistent results across adapters and can include proofs on demand.


---

## Milestone 2 — Credits + receipts MVP (accounting and incentives)

### Goals
- Make “work” measurable and rewardable.
- Build the base for tolls (comments/email) and node incentives.

### Deliverables
- Credits ledger (event-sourced, append-only):
  - JSONL events, tamper-evident hash chain
  - replayable balance derivation
  - periodic Merkle checkpoints (anchors file now; on-chain later)
- Receipts:
  - `SERVE`, `VERIFY`, `STORE` receipts (signed)
  - per-wallet caps + rate limits
- Admin tooling:
  - audit challenge endpoints
  - public ledger summaries (privacy-safe)

### Exit criteria
- Credits cannot be “edited”; they are derived from a verifiable event log.
- Receipts can be audited and rate-limited.


---

## Milestone 3 — WordPress “Toll Comments” MVP (adoption wedge)

### Goals
- Reduce spam immediately.
- Promote wallet adoption through a real-world plugin.

### Deliverables
- WP plugin: refundable toll-gated comments
  - wallet sign-in (challenge + signature)
  - `hold` → `submit` → `finalize` flow
  - admin bonus multiplier (optional) funded by a site pool
- Site pool:
  - forfeits split between pool and treasury (configurable)
  - pool balance UI in WP admin
- Basic anti-abuse:
  - per-wallet and per-site rate limits
  - cooldowns for new wallets
  - allowlist support

### Exit criteria
- Sites can install plugin, reduce comment spam, and optionally reward good comments.
- Wallet install is a natural requirement to participate.


---

## Milestone 4 — Wallet adoption milestone (Origin-Web3-Wallet)

### Goals
- Make the wallet useful even before advanced “mining/edge” features.
- Support secure secrets management and safe routing for your ecosystem.

### Deliverables
- WebExtension compatibility (Firefox target)
- Vault (client-side encrypted secrets):
  - password unlock, auto-lock timer
  - AES-GCM encryption, strong KDF
  - export/import encrypted backup
- Session-based sign-in for your services
- “Protected Mode”:
  - allowlist-only routing for your ecosystem endpoints
  - explicit non-goal: general internet VPN (for now)
- “Mining Wallet” module stub:
  - opt-in UI, resource caps
  - receipt viewer + integration hooks (no heavy compute by default)

### Exit criteria
- Wallet feels complete and safe.
- Protected Mode can be toggled on without creating an open proxy risk.


---

## Milestone 5 — TollEmail MVP (separate repo)

> Create a new repo: `TollEmail/`

### Goals
- SMTP inbound → forward to Gmail
- Toll-based anti-spam with quarantine and selective release/refund.

### Deliverables
- SMTP ingress (Postfix or Haraka) + policy service
- Quarantine store (EML + metadata; content not on ledger)
- Toll policies:
  - sender-pays (pay-to-release)
  - recipient-sponsors (escrow mode) optional
  - manual refunds/forfeits
- Risk scoring v1 (metadata-only):
  - sender infra fingerprints (IP/ASN/DKIM domains)
  - priming resistance (trust grows slowly, decays, shock penalties)
  - dynamic toll multiplier + multi-dimensional rate limits
- Ledger integration:
  - log toll events in credits ledger (holds/refunds/forfeits)
  - periodic checkpoint roots

### Exit criteria
- Unknown senders are quarantined until policy conditions are met.
- Users can release/refund from a simple dashboard.
- System shows measurable spam reduction with low false positives.


---

## Milestone 6 — Edge Network Control Plane (routing + shielding + scaling)

### Goals
- Operate multiple edge entrance points.
- Route each edge to the best toll gate.
- Keep resolver “masked” (origin-shielded).
- Autoscale toll gates based on SLOs.

### Epic A: Latency mapping + dynamic gate selection
**Deliverables**
- Edge probes to each gate:
  - TCP connect, TLS handshake, HTTP RTT
  - rolling p50/p95 + jitter
- Routing policy service:
  - best gate selection per edge (EWMA + failover)
  - gate health + circuit breakers
- Config distribution:
  - edges fetch/pull route table periodically
  - emergency override support

**Exit criteria**
- For each edge, you can answer: “best gate now” and failover automatically.

### Epic B: Origin shielding (“mask DNS behind gates”)
**Deliverables**
- Resolver private-only:
  - no public IP access (private subnet / firewall)
- Gate→Resolver auth:
  - mTLS or WireGuard identity
  - resolver rejects non-gate traffic
- Optional: signed resolve results (defense-in-depth)

**Exit criteria**
- Resolver cannot be reached directly from the public internet.
- Only gates can call `/resolve`.

### Epic C: Kubernetes autoscaling of toll gates
**Deliverables**
- Observability:
  - p95 latency, RPS, 429/5xx rate, CPU/mem, queue depth
- Autoscaling:
  - HPA based on CPU + custom metrics
  - cluster autoscaler adds/removes VMs
- Capacity planner dashboard:
  - “how many gates do we need per region” view

**Exit criteria**
- Expected spikes scale without manual intervention while meeting SLOs.


---

## Milestone 7 — Anchoring + cross-chain governance (later)

### Goals
- Make trust and accounting publicly verifiable.
- Bridge stable identity/anchors across chains.

### Deliverables
- Anchor registry roots + ledger checkpoints on EVM/L2
- Mirror checkpoints to Solana for cheap verification UX
- Governance policy + timelocks:
  - proposal queue, execution delay
  - passport/reputation-weighted voting (avoid pure token = power)
- Treasury policy:
  - predictable allocations and caps
  - transparency reports

### Exit criteria
- Auditable checkpoints exist on-chain.
- Governance cannot be trivially captured by whales.


---

## Milestone 8 — Advanced features (future)

### Ideas
- Multi-hop proxy tier (paid “privacy routing”)
- Authoritative DNS offering (nameserver delegation)
- `.dns` full namespace (OWNER/NODE_PUBKEY/ENDPOINT/CAPS/TEXT) with signed updates + proofs
- Verified tipping + dispute/bounty mechanics (safe, non-harassment oriented)
- Developer platform:
  - SDKs, CLI tools, reference implementations

### Exit criteria
- Only after adoption metrics justify operational complexity.


---

## Metrics to track (always)

- DNS:
  - p50/p95 resolve latency
  - cache hit rate
  - adapter error rates
- Toll systems:
  - spam capture rate vs false positives
  - refund/forfeit ratios
  - new wallet installs driven by WP/email flows
- Network:
  - edge→gate RTT map stability
  - gate autoscaling events and SLO compliance
- Abuse:
  - attack attempts blocked
  - rate-limit triggers
  - fraud signals and mitigations
