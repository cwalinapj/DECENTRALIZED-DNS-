# Why Switch Nameservers to TollDNS?

No crypto required. No wallet setup. Works with your existing registrar.

This page is for domain owners who want faster, safer, and more transparent DNS — without changing registrars or learning blockchain.

---

## Why switch nameservers?

Pointing your nameservers to TollDNS gives you:

- **Faster resolution** — quorum-backed recursive lookups with caching reduce latency for real-user traffic.
- **Audit trail** — every resolve returns `confidence`, `rrset_hash`, and `upstreams_used` so you can see exactly what answered your queries.
- **Renewal protection** — banner + grace + recovery flows activate before your domain silently expires (see below).
- **USD-first pricing** — no surprise crypto fees. You pay in dollars; we handle settlement behind the scenes.
- **Earnings potential** — domains using TollDNS nameservers accumulate credits that can offset renewal and hosting costs (policy-governed).

You keep full ownership at your registrar. Switching nameservers is a 5-minute change and is fully reversible.

---

## Renewal safety: banner + grace + recovery

> **MVP:** Banner and grace-period API are live. Automatic renewal execution and registrar integration are Roadmap.

Traditional registrars let domains expire silently after a missed renewal email. TollDNS adds a safety net:

| Phase | What happens | Status |
|-------|-------------|--------|
| Soft warning | Full site served; renewal banner shown via `/v1/domain/banner` | **MVP** |
| Hard warning | Interstitial page before content; owner notified multi-channel | **MVP** |
| Grace / parked mode | Domain stays reachable in safe degraded mode during policy window | **MVP (policy spec)** |
| Automatic renewal | TollDNS credits applied toward renewal, registrar API triggered | **Roadmap** |
| Recovery assist | Contested / accidentally-expired domain recovery workflow | **Roadmap** |

The banner API endpoint:

```bash
curl 'http://localhost:8054/v1/domain/banner?domain=example.com&format=json'
```

Owner acknowledgement:

```bash
curl -X POST 'http://localhost:8054/v1/domain/banner/ack' \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com"}'
```

Important: TollDNS operates within registrar/registry policy windows. This is expiration-loss protection, not an infinite hold.

See also: `docs/DOMAIN_CONTINUITY.md`, `docs/DOMAIN_BANNER_INTEGRATION.md`.

---

## Pricing won't surprise you (USD-first)

> **MVP:** USD quote-lock checkout and fixed-price tiers are live. Full subsidy automation from toll credits is Roadmap.

- You pay a fixed USD price at checkout — no crypto needed.
- Prices are quote-locked for 60–120 seconds so the rate never changes mid-checkout.
- If you want to pay in crypto, that option is available; TollDNS handles settlement and volatility for you.
- Credits earned from nameserver usage can reduce or cover renewal costs (policy-governed; amounts vary).

Pricing tiers: `docs/PRICING_TIERS.md`.
Payments and treasury: `docs/PAYMENTS_AND_TREASURY.md`.
Web2 pricing model: `docs/WEB2_PRICING_MODEL.md`.

---

## Better resolver defaults (confidence + audit fields)

> **MVP:** All fields below are live in the gateway today.

Every response from TollDNS resolvers includes structured metadata you won't get from a bare DNS query:

| Field | Meaning |
|-------|---------|
| `confidence` | `high` / `medium` / `low` — upstream quorum agreement level |
| `rrset_hash` | SHA-256 fingerprint of the answer set for change detection |
| `upstreams_used` | Which resolvers were queried and what they returned |
| `chosen_upstream` | Which upstream was used for the final answer |
| `ttl_s` | Effective TTL after confidence-based clamping |

Try it now:

```bash
curl 'https://tolldns-demo.workers.dev/v1/resolve?name=netflix.com&type=A'
```

Or locally:

```bash
PORT=8054 npm -C gateway run start
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
```

These fields make DNS changes auditable and agent-friendly without any extra tooling.

---

## Free static hosting / templates

> **Roadmap** — not live in MVP.

Plans include:

- One-click static site from your domain's DNS records — no separate hosting account needed.
- Starter templates (landing page, redirect, maintenance page) provisioned automatically when you switch nameservers.
- Hosting from wallet domains (`.eth` / `.sol`) via IPFS/Arweave: `docs/HOSTING_FROM_WALLET_DOMAINS.md`.
- Bonded abuse throttling to keep shared hosting healthy.

Static hosting spec: `docs/STATIC_HOSTING_MVP.md`.
Mass adoption roadmap (hosting tier): `docs/MASS_ADOPTION_ROADMAP.md`.

---

## How to try risk-free

### Option A: Public demo (no install)

Open the live Cloudflare resolver UI:

```
https://tolldns-demo.workers.dev/
```

Or query the API directly:

```bash
curl 'https://tolldns-demo.workers.dev/v1/resolve?name=netflix.com&type=A'
```

See `docs/PUBLIC_DEMO.md` for share-link instructions and verification steps.

### Option B: Local stack (5 minutes)

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
```

In another terminal:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
bash scripts/gateway_smoke.sh
```

Docker Compose alternative: `docs/LOCAL_STACK.md`.

### Switching your nameservers (when ready)

1. Log in to your domain registrar.
2. Find "Nameservers" or "DNS" settings for your domain.
3. Replace existing nameservers with TollDNS nameservers (provided at registration/onboarding).
4. Save. Changes propagate within minutes to hours depending on your registrar's TTL.
5. Verify:

```bash
curl 'http://localhost:8054/v1/resolve?name=yourdomain.com&type=A'
```

This change is fully reversible at any time. Your domain stays at your existing registrar.

---

## MVP vs Roadmap summary

| Feature | Status |
|---------|--------|
| Quorum recursive resolver (confidence + audit fields) | **MVP** |
| USD-first checkout with quote-lock | **MVP** |
| Renewal banner + grace-period API | **MVP** |
| Public Cloudflare demo endpoint | **MVP** |
| Local gateway stack (Docker / npm) | **MVP** |
| Automatic renewal via registrar API | **Roadmap** |
| Free static hosting / starter templates | **Roadmap** |
| Full credit-subsidy renewal automation | **Roadmap** |
| Wallet domain hosting (`.eth` / `.sol`) | **Roadmap** |
