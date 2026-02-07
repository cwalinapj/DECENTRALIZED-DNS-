# 11 — Workers & Edge Compute (Runtime, Connectors, Triggers)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS Workers are a “decentralized Cloudflare Workers”-style compute layer that runs close to the edge. The goal is to replace common paid SaaS glue and small server backends with a programmable, policy-governed worker runtime integrated with TollDNS routing, caching, and gateways.

This doc focuses on:
- worker runtime model
- triggers (forms/webhooks/email/DNS events)
- connector ecosystem (Slack/Trello/Zapier/etc.)
- security and policy controls

Related:
- Adoption strategy: `docs/10-adoption-and-product-strategy.md`
- Routing engine: `docs/07-routing-engine.md`
- Threat model: `docs/08-threat-model.md`

---

## 1) What Workers Are For

Workers enable:
- form handling without CMS plugins
- webhook transformations and routing
- SMTP replacement workflows (“email events without SMTP plumbing”)
- lightweight APIs (“mini backends”)
- static site augmentation (auth, forms, redirects, A/B, analytics hooks)
- gateway request transformation (content pointer handling)

Workers are intended to be composable and deployable by:
- end users (simple templates)
- business users (workflows and pipelines)
- developers (custom adapters/connectors)
- the protocol itself (watchdogs/incident logic where appropriate)

---

## 2) Worker Runtime Model

### 2.1 Execution Environment
Workers should be:
- sandboxed (deterministic resource limits)
- fast cold-start
- safe multi-tenant
- easy to deploy and roll back

Typical constraints (illustrative):
- strict CPU time budget per invocation
- memory cap
- outbound network allowlists (policy)
- size limits on payloads

### 2.2 Determinism vs Practicality
Not all workers can be deterministic, but correctness-sensitive workflows should prefer:
- deterministic transforms
- canonical serialization
- signed outputs where possible

---

## 3) Worker Triggers (Events)

### 3.1 Form Submit Trigger
A user can configure an “opt-in form endpoint”:
- POST endpoint provided by TollDNS
- worker executes on submit
- worker transforms payload
- worker pushes to destination (webhook/connector/secure tunnel)

This replaces:
- form SaaS
- CMS form plugins
- running a server just to capture leads

### 3.2 Webhook Trigger (Inbound)
Workers can be invoked by inbound webhooks:
- signature-verified request intake
- transform + route to user-defined destinations

### 3.3 DNS Trigger (Optional)
Some workflows can trigger on DNS events:
- a new subdomain registration
- a record update request
- a health/policy state change (governance-controlled)

DNS-triggered workers must be tightly rate-limited and policy-controlled.

### 3.4 Email/MX Routing Trigger (SMTP Replacement Assist)
For email-like workflows:
- worker identifies mail provider via MX lookup
- worker routes structured events to the user’s email system or preferred tools
- if no mail provider exists, TollDNS can provide a basic mailbox under a subdomain

Note: “SMTP replacement” here means “avoid custom SMTP plumbing for common automation,” not “break email standards.”

---

## 4) Connectors (Slack / Trello / Zapier / More)

### 4.1 Connector Types
- **Outbound connectors**: send payloads to Slack, Trello, Zapier, Make, Notion, CRMs, etc.
- **Inbound connectors**: accept webhook events and normalize them
- **Bidirectional**: sync states (where allowed)

### 4.2 Secure Delivery Methods
Workers may deliver to destinations via:
- signed webhooks (HMAC / asymmetric signatures)
- mTLS endpoints
- secure socket tunnels (client-controlled)
- OAuth-managed connector tokens (stored securely)

---

## 5) Developer Ecosystem: Bring-Your-Own Connector

TollDNS will include developer tools so third parties can add:
- connectors
- worker templates
- specialized transforms
- gateway helpers

DAO governance can:
- approve connector packages
- enforce security requirements
- set rate limits and permissions

---

## 6) Billing & Limits

Usage pricing for Workers is paid in **Index Units** (usage unit), not the native token. However during BETA will be free for earlier adapoters. 

Possible pricing dimensions:
- invocations
- CPU-time buckets
- outbound egress buckets
- connector calls
- storage reads/writes (if offered)

Native token is used for:
- gateway/connector integration fees (where applicable)
- developer payouts and incentives
- grants/bug bounties

---

## 7) Safety, Abuse Prevention, and Policy

Workers are powerful and must be constrained:
- rate limits per identity and per endpoint
- outbound allowlists and connector permission scopes
- payload size caps
- denylist categories for clearly abusive automation
- incident-mode throttling (Attack Mode)

Workers that route or transform content must comply with network policy.

---

## 8) Where This Fits in the Repo

- Worker runtime code: `/workers/` (suggested future directory)
- Connector packages: `/connectors/` (suggested)
- Templates/examples: `/examples/workers/`

Docs:
- This file: `docs/11-workers-and-edge-compute.md`
- Adoption: `docs/10-adoption-and-product-strategy.md`
