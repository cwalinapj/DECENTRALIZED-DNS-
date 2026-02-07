# 15 — Web Email + Anti-Spam (Domain/DNS-First + Token-Rewarded Reasoned Reporting)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS will offer **free web email (starter tier)** as a mass adoption wedge. To make this viable, anti-spam and anti-phishing must be strong immediately.

**Core stance**
- TollDNS is a domain/DNS-first system.
- For hosted properties, we assume **proxy-only behind TollDNS edge/CDN**.
- Therefore we emphasize:
  - domain reputation
  - DNS posture and authentication alignment (SPF/DKIM/DMARC)
  - URL/domain signals inside messages
  - and worker-powered monitoring/enforcement

This doc defines:
- a practical spam filter that works day one,
- honeypots + learning loops,
- token rewards for validated, reasoned reports,
- and a policy-driven enforcement ladder.

Related:
- Workers: `docs/11-workers-and-edge-compute.md`
- Adoption: `docs/10-adoption-and-product-strategy.md`
- Spam report spec: `specs/spam-report-format.md`
- Policy machine: `specs/policy-state-machine.md`

---

## 1) Domain/DNS-First Spam Filtering (Why)

IP reputation is useful for inbound SMTP sender infrastructure, but spammers rotate IPs cheaply.
Domains and DNS behavior provide better signal:
- domain/URL reuse across campaigns
- authentication misalignment (spoofing)
- suspicious DNS patterns (NS/MX posture, rapid churn)
- user-recognizable “brand trust” is domain-based

Therefore, spam scoring and enforcement are primarily domain/URL-driven.

---

## 2) Phase 1 (Day-One): Proven Filter Stack + DNS Auth

Use a modern spam engine (e.g., Rspamd-class approach) plus:
- SPF/DKIM/DMARC alignment as a primary signal
- domain/URL reputation lists as primary signals
- Bayesian and structural features as secondary signals
- strict bounds and safe defaults

### 2.1 Authentication Alignment (Primary)
Strong scoring for:
- SPF fail / misalignment
- DKIM invalid or misaligned signatures
- DMARC fail / reject policy mismatch
- display-name spoofing patterns (“From name” ≠ domain identity)

### 2.2 Domain/URL Reputation (Primary)
Score using:
- domain blocklists / RHSBL-style concepts
- URL/domain reputation for links in the message
- lookalike patterns (typosquatting, punycode)

### 2.3 Content/Structure (Secondary)
Use classic features as signals:
- token/Bayesian learning
- regex patterns for known lures
- MIME/attachment anomaly detection
- template fingerprints (hash-based)

### 2.4 Honeypots (High Signal)
- honeypot mailboxes never used for real comms
- honeypot form fields in hosted properties (Workers) to detect bot campaigns
Any hit increases domain/URL risk signals quickly.

---

## 3) The “Spam Button” as a Security Sensor (With Token Rewards)

### 3.1 Reasoned Reporting (Structured Reasons)
When users mark spam/phishing, they select a reason code, e.g.:
- “I don’t have an account with this service”
- “This doesn’t look like my bank”
- “Sender name and sender domain mismatch”
- “Suspicious link domain”
- “Unexpected invoice / purchase”
- “Asks for password/OTP/seed”

See: `specs/spam-report-format.md`

### 3.2 Token Rewards (Native Token) — Retroactive and Validated
Users can earn native token rewards for **high-signal reports** — but only after validation to prevent farming.

Mechanism:
1) user submits report + reason code
2) system clusters reports by domain/URL, auth results, and template fingerprints
3) watchdog thresholds confirm campaign confidence
4) rewards are paid **retroactively**:
   - higher for first reporters in a new cluster
   - smaller for confirmations
   - bonuses when the reason aligns with observed evidence (e.g., spoofing + DMARC fail)

Anti-gaming:
- reward caps per user per epoch
- reputation/age thresholds or stake requirements for higher payouts
- penalize users with repeated low-quality or adversarial reports

### 3.3 Why This Sells Workers
Because Workers can operationalize the intelligence:
- auto-generate temporary rules for new campaigns
- disable phishing landing pages hosted in our namespace
- block risky link-out domains in webmail UI
- enforce policy states (DEGRADED/DISABLED) for malicious domains

This creates a visible product:
> “Email that gets safer as users report — and reporters get paid for verified signal.”

---

## 4) Enforcement Ladder (Safe, Domain-Centric)

We enforce where we have strongest control first:

### Level A — Email-only enforcement (default)
- quarantine/deliver-to-spam
- warning banners
- link disabling or safe-link rewriting (optional)
- block sender domains per user

### Level B — Hosted Property Suspension (high leverage)
If the phishing page is hosted under our namespace (subdomain hosting):
- **immediate suspension** (block page / 451)
- disable Workers/routes
- freeze account publishing access pending review

This is strong because our hosting is proxy-only behind the edge.

### Level C — Gateway/Hosting Block
If served through our gateway/hosting stack:
- refuse to serve the content
- delist gateway route(s) for that domain/pointer as needed

### Level D — DNS Policy Block (rare, time-bounded, appealable)
Only for severe, high-confidence campaigns:
- TollDNS resolver returns `POLICY_BLOCKED` for a limited window
- requires continued confirmation to extend
- always provides an appeal path

---

## 5) Appeals and Recovery

We want new owners to recover domains, while preventing spammer loopholes.

Appeal requirements (concept):
- proof of domain control (DNS TXT challenge)
- remediation evidence (cleanup, content removal, auth hardening)
- optional stake + time lock for repeat-risk cases
- transition state:
  - DISABLED → RECOVERING (heightened scrutiny) → HEALTHY

---

## 6) What We Need to Build (Implementation Order)

1) webmail + basic filtering + SPF/DKIM/DMARC checks
2) domain/URL extraction and scoring
3) spam report UI with reason codes
4) clustering + confidence thresholds
5) retroactive reward payout logic
6) worker-powered fraud scanning of hosted properties
7) policy-driven enforcement ladder automation

---
