# ARCHITECTURE

This document describes the system components, data flows, trust boundaries, and the quantitative goals (“SLOs / KPIs”) that define success for each milestone in `ROADMAP.md`.

## High-level components

### 1) Name Gateway (DNS Gateway)
**Purpose:** One API to resolve names across ICANN + Web3 naming systems with optional proofs.

- Endpoint: `GET /resolve?name=...&proof=0|1`
- Normalization: lowercase, punycode, trim trailing dot
- Adapters:
  - ICANN via DoH
  - ENS via EVM RPC
  - SNS via Solana RPC
  - optional: Handshake, Unstoppable, etc.
- Caching: in-memory + Redis (later), serve-stale policies

### 2) Registry + Proofs
**Purpose:** Deterministic registry snapshots and Merkle proofs for `.dns` and internal mappings.

- Snapshot store: `registry/snapshots/*.json`
- Merkle root builder: deterministic, canonical encoding
- Proof bundle: returned from `/resolve` when `proof=1`
- Anchors: periodic checkpoints stored in `settlement/anchors/*` (later anchored on EVM/L2)

### 3) Credits Coordinator (Global ledger)
**Purpose:** A global, auditable credit system for tolls and incentives.

- Append-only event ledger (JSONL)
- Derived balances (no direct mutations)
- Hold/refund/forfeit/bonus primitives
- Receipts processing (SERVE/VERIFY/STORE)
- Rate limiting + daily caps
- Checkpointing:
  - hash-chain for tamper-evidence
  - Merkle roots for periodic audit/anchoring

### 4) Toll Gate (Edge enforcement layer)
**Purpose:** Enforce tolls/policies at the edge before traffic reaches private services.

- Front door for:
  - `/resolve`
  - toll actions (comments/email)
  - node receipts submission
- Enforces:
  - auth
  - quotas/credits
  - risk scoring decisions (for email)
  - rate limiting
- Origin shielding: only gates can reach resolver/registry services

### 5) Node Agent (optional contributors)
**Purpose:** Opt-in resource contribution (cache/verify/store) with auditable receipts.

- Runs on:
  - user devices (later)
  - server/VM nodes
  - optional: “WP Node Mode” for spare capacity
- Produces signed receipts
- Subject to:
  - audits
  - caps
  - reputation gating

### 6) WordPress Plugins (adoption wedge)
**Purpose:** Real-world distribution + utility.

- Toll Comments: refundable toll to post, admin bonus option
- Optional Node Mode: contribute spare capacity → fills Site Reward Pool

### 7) Origin Web3 Wallet (identity + UX)
**Purpose:** Drive installs; provide secure identity, secrets management, and safe routing.

- Vault: local encrypted secrets + backups
- Session login: sign-in with wallet challenge
- Protected Mode: allowlist-only routing for ecosystem endpoints
- Mining Wallet module stub: controls node-agent, shows receipts/earnings

### 8) TollEmail (separate repo)
**Purpose:** SMTP inbound gateway + Gmail forwarding with toll anti-spam.

- SMTP ingress (Postfix/Haraka)
- Policy service:
  - quarantine/release
  - dynamic toll (risk-based)
  - refund/forfeit flows
- Uses the global credits ledger for toll accounting
- Email metadata ledger for risk scoring (no raw content on-chain/ledger)

---

## Trust boundaries

### Client-side trust boundary
- Wallet private keys stay in wallet/app/extension.
- Vault secrets are encrypted client-side; server never sees plaintext secrets.

### Edge trust boundary
- Toll gates are public-facing and must be hardened:
  - rate limit
  - WAF rules
  - auth verification
  - strict allowlists

### Private core boundary (masked services)
- Resolver/registry should be private-only:
  - no public ingress
  - only callable from toll gates (mTLS/WireGuard identity)
- Any “direct-to-core” path is treated as a security incident.

### Ledger trust boundary
- Credits and key economic actions are append-only and checkpointed:
  - tamper-evident hash chain
  - Merkle checkpoint roots
- Later: anchor roots on stable chain (EVM/L2).

---

## Data flows

### A) Name resolution
1. Client calls Gate: `GET /resolve?name=...`
2. Gate checks:
   - rate limits / quotas
   - credits (if proof=1 is premium)
3. Gate calls private Resolver:
   - resolver selects adapter + cache
   - optional proofs if internal registry `.dns`
4. Gate returns JSON result (+ proof bundle if requested)

### B) Toll Comments (WP)
1. User signs in (wallet challenge) and requests hold via WP plugin.
2. Plugin calls Coordinator: `POST /comments/hold` (site-authenticated)
3. Comment submitted in WP, stored pending.
4. Admin action triggers `POST /comments/finalize`:
   - approved → refund + optional bonus from site pool
   - spam/trash → forfeit split to pool/treasury
5. Ledger records all actions as events.

### C) TollEmail (SMTP inbound → Gmail)
1. SMTP ingress receives mail, extracts metadata.
2. Calls policy service:
   - may quarantine
   - may require payment/hold
   - may allowlist
3. On release: forwards to Gmail with SRS + headers.
4. Coordinator records toll events (hold/refund/forfeit).
5. Metadata ledger feeds risk scoring.

### D) Node receipts + audits
1. Node performs work (serve/verify/store).
2. Node submits signed receipt.
3. Coordinator verifies signature + rate limits + caps.
4. Credits awarded via ledger event.
5. Audit challenges can verify claimed work.

---

## Quantitative goals by milestone

> Targets assume “early stage → moderate usage.” You can tighten these as you scale.

### Milestone 0 — Repo hygiene and baseline
**Goals**
- ✅ One-command dev boot for each repo/service
- ✅ Basic CI green

**Quantitative**
- New developer setup time: **< 30 minutes** from clone → tests passing
- CI runtime: **< 10 minutes** for core test suite
- Documentation coverage: **100% of services have `.env.example` + run steps**

---

### Milestone 1 — DNS Gateway MVP
**Goals**
- Fast, reliable `/resolve` with deterministic normalization and consistent outputs.

**Quantitative**
- `/resolve` success rate: **≥ 99.0%** (excluding upstream outages)
- p95 latency (cached): **≤ 30 ms** (inside a region)
- p95 latency (uncached, ICANN via DoH): **≤ 300 ms**
- Cache hit rate (steady state): **≥ 70%** for repeated queries
- Output schema compliance: **100%** (schema validation enforced)

---

### Milestone 2 — Credits + receipts MVP
**Goals**
- Auditable credits ledger + receipts working with caps and replay.

**Quantitative**
- Ledger integrity: **0** balance mutations outside event replay
- Replay correctness: derived balances match snapshots **100%** of test runs
- Checkpoint frequency: **hourly or daily** with **0 missed checkpoints**
- Receipt acceptance p95: **≤ 50 ms** at coordinator under normal load
- Fraud resistance: **≥ 95%** of invalid receipts rejected in tests (signatures, replay, caps)

---

### Milestone 3 — WP Toll Comments MVP
**Goals**
- Measurable spam reduction + smooth UX.

**Quantitative**
- Spam comment reduction vs baseline: **≥ 80%**
- Legit comment friction:
  - median time from “connect wallet” to “comment submitted”: **≤ 20 seconds**
- False positive (legit marked spam/trash): **≤ 2%** (site-admin dependent)
- Coordinator availability for comment flow: **≥ 99.5%**
- Hold TTL failures (users timing out): **≤ 5%** of attempts

---

### Milestone 4 — Wallet adoption milestone
**Goals**
- Vault + session login + protected mode; Firefox support.

**Quantitative**
- Vault unlock time: **≤ 1 second** (typical device)
- Auto-lock reliability: **100%** (no secrets accessible after lock)
- Protected Mode routing:
  - allowlist enforcement: **0** requests proxied to non-allowlisted hosts
- Extension stability:
  - crash-free sessions: **≥ 99%** of sessions (target)
- Build + test:
  - `npm test` pass rate **100%** in CI

---

### Milestone 5 — TollEmail MVP (separate repo)
**Goals**
- SMTP inbound → Gmail forwarding with quarantine and toll-based gating.

**Quantitative**
- Deliverability:
  - forwarded mail acceptance rate (Gmail): **≥ 98%** for allowlisted senders
  - DMARC breakage incidents: **≤ 1%** (SRS + header handling)
- Spam containment:
  - unknown senders reaching inbox without payment/allowlist: **≤ 1%**
- Quarantine processing:
  - p95 policy decision time: **≤ 150 ms**
  - p95 release-to-forward time: **≤ 5 seconds**
- User experience:
  - median release action (dashboard) to inbox: **≤ 30 seconds**
- Priming defense:
  - sudden volume spikes (≥3× baseline) trigger risk multiplier: **100%** of test scenarios

---

### Milestone 6 — Edge Network Control Plane
**Goals**
- Latency-aware routing, origin shielding, autoscaling.

**Quantitative**
**Epic A (Latency mapping)**
- Probe interval: **≤ 10s** (edges → gates)
- Routing convergence after degradation: **≤ 60s**
- Routing accuracy: chosen gate is within **+20 ms** of best available **≥ 90%** of time

**Epic B (Origin shielding)**
- Public reachability of resolver: **0** (must fail from the public internet)
- Gate auth failure rate (mTLS/WG): **≤ 0.1%**
- Unauthorized core requests blocked: **100%**

**Epic C (Autoscaling)**
- Scale-up reaction time: **≤ 2 minutes** to add capacity under load
- SLO compliance under expected spikes:
  - gate p95 latency: **≤ 80 ms**
  - 429 rate: **≤ 0.5%**
  - 5xx rate: **≤ 0.2%**

---

### Milestone 7 — Anchoring + cross-chain governance
**Goals**
- Publicly verifiable checkpoints and safe governance constraints.

**Quantitative**
- Anchoring:
  - checkpoint roots anchored on EVM/L2: **daily** (or hourly later)
  - anchoring missed days: **0** per 30-day window
- Governance safety:
  - timelock: **≥ 24h** for critical actions
  - emergency pause: **< 5 minutes** to activate (operational)
- Treasury:
  - published monthly transparency reports: **100%** on time
  - allocation drift from policy: **≤ 1%** (rounding aside)

---

### Milestone 8 — Advanced features
**Goals**
- Only after adoption warrants the complexity.

**Quantitative triggers (gates to start these)**
- Active sites using WP plugin: **≥ 100**
- Wallet installs with weekly active users: **≥ 10,000 WAU**
- `/resolve` volume: **≥ 5M queries/day**
- TollEmail active aliases: **≥ 10,000**
- Abuse operations workload: manageable at **< 1 FTE per 10k active users** (target)

---

## Observability and reporting (always-on)

### Required metrics
- DNS: p50/p95 latency, cache hit rate, adapter error rates
- Credits: ledger event throughput, replay time, checkpoint success
- Toll systems: quarantine rates, refund/forfeit ratios, abuse triggers
- Network: edge→gate RTT map, failover events, autoscaling actions
- Security: blocked requests, rate-limit hits, anomaly spikes

### Minimum dashboards
- “System health” (SLOs at a glance)
- “Abuse & spam” (rates, quarantines, priming signals)
- “Economy” (credits minted/spent/held, pools/treasury)
- “Edge” (latency map, gate selection, errors)

---

## Non-goals (for now)
- General-purpose consumer VPN for all traffic
- On-chain storage of email content
- Token-weighted governance where buying tokens alone can control policy
