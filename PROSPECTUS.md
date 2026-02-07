# TollDNS / DECENTRALIZED-DNS — Prospectus (Developer + Partner Version)

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

TollDNS is a concept for a **decentralized Cloudflare-like edge fabric** that starts with **paid recursive DNS (DoH/DoT)** and expands into a distributed network of **edge ingress + caching + gateways + minimal hosting** operated by independent “miners” (operators).

Two core wedges make this adoptable:

1) **Stable, paid DNS** (Index Unit tolls via vouchers; no per-query on-chain).
2) A **secure-by-default edge platform** (hosting, email, gateways) where **Workers + watchdogs** actively prevent fraud, spam, and phishing.

---

## 1) What We’re Building

### A) Paid Recursive DNS (DoH/DoT)

- ICANN domains immediately.
- Web3 namespaces via adapters (ENS/SNS/Handshake/PKDNS/etc.).
- Policy-driven routing and automatic fallback.

### B) Proxy-Only Hosting and Gateway (Cloudflare-Style)

**Strong stance:** TollDNS-hosted properties are **100% proxied behind TollDNS edge/CDN**.

- We do not plan to assign each hosted domain its own public IP by default.
- The “control plane” is domain/DNS/policy driven.

### C) Workers: The Product That Users See

Workers are not a footnote. Workers are how we deliver:

- plugin-free forms and automations,
- secure webhook routing,
- anti-fraud scanning of hosted properties,
- email spam/phishing intelligence loops,
- security/functionality “checkups” for hosted sites.

### D) Email + Anti-Spam (First-Class)

We will offer **free webmail (starter tier)** and use:

- domain/DNS-first spam signals,
- honeypots,
- user feedback labels,
- and a token-incentivized “reasoned reporting” system.

### E) Minimal Hosting: Static + Workers = Reliability

Static hosting + Workers:

- reduces attack surface,
- improves uptime,
- avoids CMS/plugin maintenance traps,
- and scales efficiently on edge caches.

### F) Miners = Hosters = Edge (Docker First)

Miners run the edge:

- ingress, caching, gateways, and hosting components
- via a Phase 1 Docker stack → then Pi firmware → router firmware → ASIC edge devices.

---

## 2) Economic Model (Two-Asset)

### Index Units (Usage / Tolls)

- DNS/edge usage is priced in an Index Unit (stable usage unit).
- Paid via off-chain vouchers + batch settlement (no prompt per query).

### Native Token (Incentives + Governance)

Native token is used for:

- miner rewards,
- gateway/adaptor listing fees and revenue shares,
- grants/bug bounties,
- DAO reserves,
- consumer hardware/ISP subsidy programs,
- and **user reward programs** (spam/fraud labeling bounties).

---

## 3) The Differentiator: “Security Enforcement as a Feature”

Most providers do not reliably prevent fraud/spam because monitoring is expensive and enforcement is slow. TollDNS sells safety as a product:

- **Workers + crawlers + checkups** continuously monitor newly created hosted properties.
- Fraudulent subdomains are **suspended quickly** (in our namespace) because everything is proxied behind our edge.
- Email spam/phishing is reduced by **domain/DNS-first filtering** plus **token rewards** for validated “reasoned reports”.

This puts the “Worker feature” in the center:
> You’re not just buying hosting. You’re buying automated protection.

---

## 4) Adoption Flywheel: Free Benefits → Opt-In Contribution

We lead with free benefits:

- free static hosting for simple sites,
- free webmail starter tier,
- secure checkups and alerts,
- browser plugin for Web3 resolution and login/SSO helpers,
- plugin-free forms and automations.

Over time, users can opt into running a lightweight background service to help sustain the free tier:

- caching contribution, health probing, policy-compliant edge participation (resource capped).

---

## 5) Roadmap Highlights (Fast Path)

1) Docker miner stack (operators join quickly)
2) Minimal testnet loop (policy + settlement + receipts)
3) Default gateway + hosting + webmail starter
4) Workers templates + security checkups + fraud scanning pipeline
5) Token-incentivized “reasoned spam/fraud reporting”
6) Expand adapters and edge footprint

---

## 6) Where to Start in This Repo

- Adoption: `docs/10-adoption-and-product-strategy.md`
- Workers: `docs/11-workers-and-edge-compute.md`
- Email + anti-spam: `docs/15-email-and-anti-spam.md`

Specs:

- Backend interface: `specs/backend-interface.md`
- Health: `specs/health-report-format.md`
- Receipts: `specs/receipt-format.md`
- Policy machine: `specs/policy-state-machine.md`
- Spam reports: `specs/spam-report-format.md`
