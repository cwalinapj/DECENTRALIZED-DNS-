# 05 — Tokenomics (Index Unit Tolls + Native Token Incentives + Role-Based Access)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

TollDNS uses a **two-asset model**:

- **Index Unit** = the stable unit for **usage pricing** (DNS queries, gateway routing/content retrieval, Workers/edge compute, hosting, and future premium edge features).  
- **Native Token** = the asset for **governance, incentives, integration fees, reserves, grants, and accountability staking**.

This separation prevents basic usage pricing from being distorted by crypto volatility while still enabling a powerful incentive and governance layer.

Related:

- Backends: `docs/02-resolution-backends.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Resilience incentives: `docs/06-resilience-tokenomics.md`
- Routing: `docs/07-routing-engine.md`
- Receipts: `specs/receipt-format.md`
- Policy state machine: `specs/policy-state-machine.md`

---

## 1) Index Unit (Usage / Tolls)

### 1.1 What the Index Unit Prices

Index Unit is the canonical unit for:

- paid recursive DNS queries (DoH/DoT)
- gateway routing and content retrieval (IPFS/Filecoin/Arweave and other adapters)
- Workers/edge compute usage (forms, webhooks, transformations, checkups)
- hosting usage (bandwidth/storage tiers, premium features)
- future Cloudflare-like features (nameserver service, advanced caching tiers, security add-ons)

**Rule:** usage pricing is **always** Index-based, not native-token based.

### 1.2 Why Index Units (Fairness + Stability)

Index Units are intended to be stable and fair across time and geography, avoiding:

- extreme crypto volatility and wealth concentration effects
- “USD-only peg” fairness issues in global cost-of-living contexts

Implementation details for Index Unit can evolve, but the system goal remains:

- predictable pricing for users
- stable budgeting for operators

---

## 2) Native Token (Governance + Incentives + Integration + Reserves)

Native token is used for:

- DAO governance and voting
- operator/miner incentives and payouts (proof-of-serving)
- developer grants, bug bounties, community operations
- integration/listing fees (gateway adapters, backend adapters)
- reserves (treasury) for resilience budgets and emergency programs
- partner programs (hardware subsidies, ISP programs, scrubbing/edge partnerships)

**Rule:** the native token is **not** used as the per-query toll unit.

---

## 3) Spend Escrow vs Stake (Two Different Concepts)

### 3.1 Spend Escrow (Index Unit Convenience)

Spend escrow exists to prevent “click OK on every query”:

- users pre-fund Index spend
- usage is authorized via off-chain vouchers
- settlement occurs in batches

Spend escrow is about convenience and UX.

### 3.2 Stake (Native Token Accountability)

Stake is about permissions and accountability:

- reduces Sybil identity spam
- aligns incentives for higher-impact actors
- supports governance enforcement (delisting, penalties, future slashing if adopted)

Stake MUST be time-locked (no instant exit).

---

## 4) Staking Rules (No Instant-Exit Abuse)

To prevent “stake → misbehave → withdraw immediately” abuse, all required staking MUST follow:

- minimum lock / freeze period (e.g., 30 days)
- cooling-off exit delay (withdrawals only claimable after a delay window)
- optional later: slashable stake for provable violations (only where objective proofs exist)

Stake is not “refund-on-demand escrow.”
Stake is a permission gate with time-locked accountability.

---

## 5) Role-Based Access: Index Tolls + Native Stake Requirements

TollDNS separates **usage pricing** from **permissions/accountability**:

- **Index Unit** is always the unit used for tolls/usage (DNS queries, gateways, Workers/hosting usage, future premium features).
- **Native token staking** is a role-gate and accountability mechanism for participants whose usage can create outsized risk or load (business usage, developer integrations, miners/operators, ISP partners).

### 5.1 End Users (Consumer / Personal Use)

End users who do not use the internet primarily as a means of income (i.e., not operating revenue-generating internet services) are:

- **Required:** pay tolls in **Index Units**
- **Not required:** stake native token (default)

This keeps the DNS accessible and fair for everyday users.

### 5.2 Business Users (Revenue-Generating / Hosting / Commercial Use)

Business users (including hosting providers, SaaS operators, ecommerce, and services that depend on DNS/edge availability for income) must:

- **Required:** pay tolls in **Index Units**
- **Required:** stake native token (role-based minimums)

Rationale:

- businesses can generate higher-volume patterns and externalize risk (abuse, misconfiguration, operational load)
- stake creates accountability and aligns incentives with network health

Business stake can unlock (governance-defined):

- higher rate limits / higher spend ceilings
- priority support / SLA tiers
- access to higher-impact premium features as they launch

### 5.3 Developers (Gateway / Adapter / Integration Builders)

Developers who publish gateway adapters or backend integrations must:

- **Required:** pay any applicable listing/integration fees in **native token** (if governance requires)
- **Required:** stake native token (developer tier)
- **Also pay:** Index Unit usage tolls for traffic their integration consumes or triggers (policy-defined)

Developers have more permissions than end users, such as:

- submitting new adapters/backends for DAO approval
- receiving revenue share payouts when traffic routes through their gateway
- participating in higher-privilege governance processes (optional)

### 5.4 Miners / Operators (Edges, Gateways, Caches, Anycast, Scrubbing)

All miners/operators must:

- **Required:** stake native token (operator tier)
- **Earn:** payouts in native token based on proof-of-serving and performance
- **Also pay (optional):** Index Unit tolls for certain network resources they consume (governance-defined)

Stake is used to:

- reduce Sybil attacks (cheap identity spam)
- enforce operator accountability
- support governance enforcement (delisting, penalties, future slashing if adopted)

### 5.5 ISP Partners (ISP-Hosted DNS / “Web3-Enhanced DNS” Tier)

ISPs can participate as **ISP_RECURSOR_PARTNER** operators. They already run recursive DNS at scale and control default DNS settings on consumer routers, making them ideal distribution partners for “Web3-ready DNS.”

**Required (default model):**

- **Stake native token** (ISP operator tier) for high-impact permissions and accountability.
- Participate in Index Unit tolling for the **Web3/gateway tier** (either end-users pay, or the ISP subsidizes).

**What ISPs can operate:**

- DoH/DoT ingress endpoints
- recursive resolver + caching
- upstream quorum validation
- optional gateway routing + caching for Web3 content networks

**Toll scope (transparency-first):**

- Default: tolling applies to **Web3 naming + gateway routing/content retrieval**
- ICANN/Web2 DNS recursion can remain untolled (or a separate plan) to avoid “charging for basic DNS” concerns.

**Revenue share:**
When Web3/gateway traffic routes through an ISP partner stack:

- tolls are collected in **Index Units**
- receipts prove delivered service
- payouts are distributed by policy, typically including:
  - ISP share (recursive/edge/caching service)
  - gateway/operator share (if third-party gateway served content)
  - protocol share (reserves/security/watchdogs/subsidies)

ISPs can optionally use their share to subsidize customers (e.g., “free Web3 DNS/gateway access” as a plan feature).

---

## 6) Fees and Revenue Flows

### 6.1 Index Unit Toll Flow (Usage)

Index Unit toll revenue can be allocated (policy-defined) to:

- base operator payouts (service delivery)
- resilience budgets (anycast/edges/scrubbing)
- subsidy pools (free gateway tiers, consumer programs)
- protocol reserves (treasury)

### 6.2 Native Token Flow (Incentives + Integration)

Native token can flow through:

- operator/miner reward programs
- developer gateway revenue share payouts
- integration/listing fee payments
- grants/bounties/community operations
- reserve accumulation and emergency response budgets

---

## 7) Gateway Listing Fees + Revenue Potential (Developer Ecosystem)

TollDNS supports third-party gateways/adapters:

- gateways can pay a **listing fee** in native token (if required by governance)
- after listing, gateways can earn ongoing revenue:
  - when TollDNS routes traffic through a gateway, the gateway receives a share of the associated toll revenue (converted/payed out per policy)
- if enough traffic flows, a gateway operator can potentially earn more than the initial listing fee (operate profitably)

Gateways can be degraded/delisted if they violate policy or fail conformance/health checks.

---

## 8) “No Refundable Escrow Staking” (Explicit Policy)

We explicitly avoid staking designs where stake is instantly withdrawable (or trivially refunded), because it enables:

1) post stake,
2) behave exploitively,
3) withdraw quickly before consequences apply.

When staking is used, it MUST be time-locked and governed.

---

## 9) Proof-of-Serving, Payouts, and Measurement

Operator payouts should be based on:

- proof-of-serving receipts (signed)
- health/performance buckets (success rates, latency)
- conformance checks (where applicable)
- diversity multipliers (region/ASN caps and quotas)
- incident/attack-mode multipliers (when active)

See:

- `specs/receipt-format.md`
- `specs/health-report-format.md`
- `docs/06-resilience-tokenomics.md`

---

## 10) Pricing Principle for Future Cloudflare-Like Features

As TollDNS expands into features similar to a cloud edge provider (nameserver service, advanced caching, Workers compute tiers, security suites, gateway acceleration):

- **Usage is priced in Index Units**
- **Access may require native token stake** for higher-risk tiers (business/dev/operator roles)
- Governance defines exact thresholds and caps

This keeps pricing stable and accessible, while still enforcing accountability where needed.

---

## 11) Summary Table

| Role | Pays Usage Tolls | Stakes Native Token | Notes |
|---|---|---|---|
| End User | Index Units | No (default) | Consumer use |
| Business User | Index Units | Yes | Higher limits / accountability |
| Developer | Index Units (for usage) | Yes | Publish adapters + revenue share |
| Miner/Operator | N/A (earns) / optional Index usage | Yes | Runs edge/gateway/cache |
| ISP Partner (ISP_RECURSOR_PARTNER) | Index Units (Web3/gateway tier) | Yes | Revenue share for Web3/gateway tolls; opt-in tier |

---
