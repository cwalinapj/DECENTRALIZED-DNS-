# Domain Continuity (Anti-Expiration Loss)

## Problem Statement

Domains are often lost because renewal notices are missed (spam filtering, stale email, ownership turnover, or billing confusion).  
When this happens, high-value names can expire and be auctioned or hijacked, which harms businesses and users.

## What TollDNS Offers

TollDNS provides expiration-loss protection, not an infinite hold.  
For eligible domains, TollDNS keeps the domain reachable in a safe degraded mode while renewal is pending and sends aggressive renewal notices.  
Renewal can be reduced or covered by credits earned from nameserver usage (tolls behind the scenes), with no crypto required for end users.

## Eligibility Gates (Anti-Abuse)

A domain must pass objective gates to qualify:

- Nameservers must point to TollDNS continuously for a minimum policy window (for example, X days).
- Domain control must be proven (DNS TXT challenge, account proof, or signer proof).
- Site must pass basic "real site" heuristics:
- uptime and traffic signals above minimum thresholds
- not flagged as spam/malware
- optional verified-business tier for higher continuity limits
- Domains that fail abuse checks are not eligible.

## Renewal Lifecycle Phases

TollDNS continuity follows policy windows and registrar/registry rules:

1. Phase A: Soft Warning
- Full content is served.
- Banner warning and renewal reminders are shown.

2. Phase B: Hard Warning
- Interstitial warning appears before content.
- Content remains reachable.

3. Phase C: Safe Parked Mode
- Site content is hidden and replaced with a safe continuity page.
- Domain is not immediately auctioned while permitted windows remain open.

4. Phase D: Registry Finalization
- Final registrar/registry actions execute once allowed windows expire.
- Domain may be released per ICANN/registry policy.

Important boundary:

- TollDNS operates within registrar/registry policy windows.
- TollDNS cannot override ICANN registry rules.

## UX and Trust Model

Warning/interstitial pages should be verifiable:

- include registrar-of-record context where available
- include a signed notice token (`notice_signature`) for auditability
- show actionable next steps and deadlines

User messaging goals:

- clear "No crypto required" language
- multi-channel notifications (email, alternative contacts, dashboard alerts)
- explicit phase and deadline visibility

## Economics (Web2 UX, Tokenized Backend)

- Users earn credits by keeping nameservers pointed to TollDNS.
- Credits can offset renewal and related service costs.
- Backend economics route toll flows into subsidy pools.
- This is policy-controlled and conditional; not every renewal is fully free.

Recommended language:

- "Renewals can be reduced, and in some cases fully covered, based on policy and available credits."

## MVP Boundary and Roadmap

MVP in this repo includes:

- policy specification
- API contract placeholders
- SDK stubs for client integration

Later phases include:

- registrar integration
- automatic renewal execution
- full policy enforcement + production incident workflows

## Registrar Adapter v1 Feature Flags (MVP-safe)

Real registrar calls are disabled by default. Use feature flags explicitly:

- `REGISTRAR_ENABLED=0|1` (default `0`)
- `REGISTRAR_PROVIDER=mock|porkbun` (default `mock`)
- `REGISTRAR_DRY_RUN=0|1` (safe default: `1` if provider secrets are missing)

Provider credentials are env-only and never committed:

- `PORKBUN_API_KEY`
- `PORKBUN_SECRET_API_KEY`
- `PORKBUN_ENDPOINT` (optional override)

Safety behavior:

- If `REGISTRAR_ENABLED=1` with missing provider secrets and `REGISTRAR_DRY_RUN=1`, endpoints return simulated provider-shaped responses.
- If `REGISTRAR_ENABLED=1` with missing secrets and `REGISTRAR_DRY_RUN=0`, gateway startup fails with a clear configuration error.

## Rate Limits and Audit Trail (MVP)

Registrar and continuity paths are rate-limited in gateway with per-IP + per-domain keys:

- `RATE_LIMIT_WINDOW_S` (default `60`)
- `RATE_LIMIT_MAX_REQUESTS` (default `20`)

Audit logs are written as privacy-safe JSONL:

- `AUDIT_LOG_PATH` (default `gateway/.cache/audit.log.jsonl`)
- actor identifier is an IP hash, not raw IP
- decisions include: `dry_run`, `executed`, `blocked`, `rate_limited`

## Continuity Eligibility Enforcement Knobs

Continuity responses include:

- `uses_ddns_ns`
- `eligible_for_hold`
- `eligible_for_subsidy`

If a domain does not use TollDNS nameservers, continuity status is still visible, but hold/subsidy eligibility is disabled in MVP policy output.
