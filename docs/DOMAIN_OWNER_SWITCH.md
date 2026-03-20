# Why Switch Nameservers to TollDNS?

No crypto required. No wallet setup. Works with your existing registrar.

This page is for domain owners who want a more portable naming and routing layer, safer DNS operations, and a simpler renewal safety net without changing registrars or learning blockchain.

---

## Why switch nameservers?

Pointing your nameservers to TollDNS gives you:

- **Safer resolver behavior** — quorum-backed recursive lookups with caching are designed to reduce latency and give you more stable answers for real-user traffic.
- **Built-in auditability** — every resolve returns `confidence`, `rrset_hash`, and `upstreams_used` so you can inspect what answered your query.
- **Renewal safety net** — warning banners, grace behavior, and recovery assistance are designed to activate before a missed renewal turns into silent loss.
- **USD-first checkout** — pay in dollars with quote-locked pricing instead of being forced into a crypto flow.
- **Policy-based credits** — nameserver usage can accumulate credits that may offset renewal or hosting costs, subject to policy.

You keep full ownership at your registrar. Switching nameservers is usually a 5-minute change and is fully reversible.

---

## Renewal safety: banner + grace + recovery

> **MVP:** Banner and grace-period API are live. Automatic renewal execution and registrar integration are Roadmap.

Traditional registrars often rely on email reminders and standard expiration flows. TollDNS adds an extra continuity layer before expiration becomes irreversible:

| Phase | What happens | Status |
|-------|-------------|--------|
| Soft warning | Full site served; renewal banner shown via `/v1/domain/banner` | **MVP** |
| Hard warning | Interstitial shown before content; owner notification escalates across configured channels | **MVP** |
| Grace / parked mode | Domain remains reachable in a safe degraded mode during the policy window | **MVP (policy spec)** |
| Automatic renewal | Eligible credits applied toward renewal and registrar API invoked automatically | **Roadmap** |
| Recovery assist | Guided workflow for contested or accidentally expired domains | **Roadmap** |

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

Important: TollDNS operates inside registrar and registry policy windows. This is expiration-loss protection, not an unlimited hold.

See also: `docs/DOMAIN_CONTINUITY.md`, `docs/DOMAIN_BANNER_INTEGRATION.md`.

---

## Pricing won't surprise you (USD-first)

> **MVP:** USD quote-lock checkout and fixed-price tiers are live. Full subsidy automation from toll credits is Roadmap.

- You pay a fixed USD price at checkout. Crypto is optional, not required.
- Prices are quote-locked for 60-120 seconds so the checkout amount does not change mid-flow.
- If you choose crypto, TollDNS handles settlement and volatility behind the scenes.
- Credits earned from nameserver usage may reduce or cover renewal costs, subject to policy and plan rules.

Pricing tiers: `docs/PRICING_TIERS.md`.
Payments and treasury: `docs/PAYMENTS_AND_TREASURY.md`.
Web2 pricing model: `docs/WEB2_PRICING_MODEL.md`.

---

## Better resolver defaults (confidence + audit fields)

> **MVP:** All fields below are live in the gateway today.

Every response from TollDNS resolvers includes structured metadata you typically do not get from a bare DNS query:

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

These fields make DNS changes easier to audit, compare, and automate against without extra tooling.

---

## Free static hosting / templates

> **Roadmap** — not live in MVP.

This is an expansion path, not the main reason to evaluate TollDNS today.

Plans include:

- One-click static site provisioning from your domain's DNS records with no separate hosting account.
- Starter templates such as landing page, redirect, and maintenance page provisioned automatically when you switch nameservers.
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

This change is fully reversible. Your domain remains at your existing registrar the whole time.

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
