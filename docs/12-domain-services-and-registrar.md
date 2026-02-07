# 12 — Domain Services & Registrar (ICANN + Gateway Domain + Crypto Lock-Ins)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

Domains are a mass adoption channel. TollDNS aims to offer:

- ICANN domains (registrar services)
- integrated DNS + Workers + hosting + email assist
- a gateway-branded domain/namespace concept
- crypto-based “lock-in” renewals (multi-year) that avoid credit card churn

Related:

- Adoption strategy: `docs/10-adoption-and-product-strategy.md`
- Tokenomics: `docs/05-tokenomics.md`

---

## 1) ICANN Domains (Registrar Path)

### 1.1 Product Intent

Offer ICANN domains with:

- competitive pricing
- modern UX
- integrated features:
  - DoH/DoT DNS
  - Workers automation
  - free static hosting tier
  - optional mailbox/subdomain mail assist
  - gateway routing where applicable

### 1.2 Why Registrar Matters

- users already buy domains
- it creates a distribution channel for DNS, hosting, and Workers
- it reduces friction vs asking users to switch DNS first

---

## 2) Gateway-Branded Domain / Namespace (e.g., “.strong” Concept)

To simplify adoption and create a recognizable trust mark:

- introduce a gateway-branded domain/namespace concept (example: `.strong`)
- or provide gateway subdomains under an ICANN domain controlled by TollDNS

Goals:

- simple default gateway endpoints
- friendly URL formats
- quick adoption without requiring browser changes immediately

This also enables:

- “free gateway” as part of the domain product
- bundling hosting + Workers + gateway routing

---

## 3) Free Trial and “Forever” Options (Where Feasible)

For gateway-style domain products or special namespaces:

- free trial window (e.g., 10 days)
- then:
  - one-time fee “forever” where feasible (for non-ICANN namespace products)
  - or standard recurring renewal (ICANN domains require renewal)

---

## 4) Crypto-Based Multi-Year Renewal Lock-Ins (No Credit Card Required)

### 4.1 The Idea

Allow users to “lock in” 1/2/3/5 years of renewals using crypto mechanics instead of recurring card billing.

Mechanism concept:

- user locks native tokens (or approved collateral) for a selected term
- TollDNS finances ICANN renewal fees internally
- user receives term coverage while collateral remains locked

### 4.2 Economic Framing (Concept)

This can be modeled like TollDNS borrowing against locked value at a target rate (e.g., 5% APR equivalent), where governance defines:

- lock requirements by TLD and term
- risk buffers and safety margins
- exit/cooldown rules
- whether any partial refund exists after term coverage is secured

### 4.3 User Benefits

- no card failures
- no surprise expirations
- long-term price predictability
- aligns users with the network

---

## 5) “Free Gateway” for Domains (Differentiator)

TollDNS domains can include a built-in gateway path:

- DNS resolves to gateway endpoints
- content addressing and web3 pointer support can be included as a feature tier
- gateways are subsidized by toll usage and ecosystem economics

Over time, if TollDNS edge presence is large enough:

- other resolvers could route through TollDNS gateways as upstreams (policy and partnerships dependent)

---

## 6) Governance and Compliance

Domain services and gateways are governed by:

- listing policies (what integrations are allowed)
- abuse and takedown processes (policy-driven and auditable)
- clear rules for delisting or disabling unsafe gateways/backends

---

## 7) Where This Fits in the Repo

Implementation (suggested future):

- `/domains/` — registrar tooling, DNS management APIs, renewal automation
- `/gateway/` — gateway management and routing
- `/workers/` — automation used for renewals/forms/etc.

Docs:

- This file: `docs/12-domain-services-and-registrar.md`
- Adoption: `docs/10-adoption-and-product-strategy.md`
