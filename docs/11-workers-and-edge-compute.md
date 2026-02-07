# 11 — Workers & Edge Compute (Connectors, Checkups, Fraud Monitoring)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

Workers are the “Cloudflare-like” compute layer that makes TollDNS visible to normal users.
They power:
- forms + automation connectors
- security/functionality checkups
- fraud detection for hosted subdomains
- email intelligence workflows
- gateway request transformations

**Proxy-only assumption**
TollDNS-hosted properties are intended to be **100% proxied behind TollDNS edge/CDN**. Enforcement is domain/DNS/policy-driven.

Related:
- Adoption: `docs/10-adoption-and-product-strategy.md`
- Threat model: `docs/08-threat-model.md`
- Watchdogs: `docs/03-watchdogs-and-fallback.md`

---

## 1) Worker Triggers (Events)

### 1.1 HTTP/Form Submit
- hosted endpoints for opt-in forms
- template-based Workers route submissions to destinations

### 1.2 Webhooks (Inbound)
- signature-verified request intake
- normalize/transform and forward to connectors

### 1.3 Scheduled Checkups
- periodic site health checks
- TLS and basic security posture checks
- “expected behavior” checks for common templates

### 1.4 Publish / Update Events (Hosted Properties)
When a user publishes/updates a site:
- Workers can run pre-flight checks
- scan content for phishing/fraud patterns
- verify policy compliance before going live (optional)

---

## 2) Connectors (Make Workers Useful Immediately)

Provide connectors for:
- Slack / Trello / Zapier / Make / Notion / CRMs
- email delivery hooks (where appropriate)

Security:
- secrets stored securely (not in `.env`)
- signatures/mTLS where possible
- strict permission scopes

---

## 3) The “Secure Hosting Checkups” Product

This is a differentiator and should be marketed as such.

Checkups can include:
- uptime/reachability
- TLS sanity (expiry, config warnings)
- basic security headers checks (where applicable)
- link-out reputation checks (domains in page)
- template integrity checks (expected status codes)
- change detection (unexpected content changes)

Outputs:
- user-facing dashboard
- alerts (email/app)
- policy hooks (auto-suspend on high confidence fraud)

---

## 4) Fraud Monitoring Pipeline (This Sells Workers)

Because hosted properties are proxied behind our edge, Workers can enforce fast.

### 4.1 What We Monitor
- new subdomain creations and rapid churn
- brand impersonation patterns (lookalike domains, layout templates)
- suspicious outbound links and redirect chains
- phishing kits and known lure templates
- forms collecting sensitive data (passwords/OTP/seed) without policy approval

### 4.2 Enforcement Actions (Policy Controlled)
Primary action (default):
- **suspend hosted subdomain** (451/block page)
- disable Workers and routes
- flag account/operator

Stronger actions:
- block gateway serving for that content
- rare: request DNS policy block for TollDNS users (time-bounded)

### 4.3 Appeals and Recovery
Domains/subdomains can be moved to:
- `RECOVERING` with heightened checks
- then back to `HEALTHY` after remediation

---

## 5) Billing & Incentives

Workers usage is priced in Index Units (usage unit).
Native token is used for:
- operator incentives
- developer grants
- gateway listing fees
- and user reward programs (spam/fraud labeling bounties)

---

## 6) Developer Tools (Make it Extensible)
Provide:
- worker templates library
- connector SDK
- local dev runner
- conformance tests for security checkups and fraud scanners (where applicable)

---
