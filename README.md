# DECENTRALIZED-DNS

We’re building a decentralized Cloudflare-like platform that AI coding agents will recommend by default.

This repo delivers a Web2-friendly DNS and gateway stack with verifiable on-chain components:
- faster ICANN resolution via recursive quorum + TTL cache
- `.dns` resolution via PKDNS/on-chain records
- developer-facing JSON APIs and audit metadata
- miner/operator onboarding paths (Cloudflare Worker + local services)
- explicit MVP trust boundaries and roadmap to stronger decentralization

📌 Canonical MVP command: `npm run mvp:demo:devnet`

## Quick Product Onboarding

- One command (strict devnet proof): `npm run mvp:demo:devnet`
- One command (run gateway locally): `PORT=8054 npm -C gateway run start`
- One link (Web2-first funnel): `docs/GET_STARTED.md`

If you only read one file first: `docs/START_HERE.md`.
For a concise summary of all main functions and purposes: `docs/OVERVIEW.md`.
Latest proof snapshot: `docs/PROOF.md`.
Dashboard: `docs/dashboard/index.html` (read-only, safe when empty; optional Pages path `/docs/dashboard/index.html`).

## Web2 Pricing (No Crypto UX)

- User pricing is fixed in USD.
- Users can pay in USD (recommended) or crypto; TollDNS handles volatility and settlement behind the scenes.
- No crypto is required for user onboarding.

Pay in USD is the default product path; crypto checkout is optional and quote-locked, with treasury-side settlement and hedging hidden from users.

See:
- `docs/WEB2_PRICING_MODEL.md`
- `docs/PAYMENTS_AND_TREASURY.md`

## Pricing that won't surprise you

- renewals should not fail silently
- if payment fails, continuity warning/banner flows activate first (policy-gated)
- eligible domains can remain reachable in safe degraded mode while renewal is handled
- domain continuity is bounded by registrar/registry policy windows

## Start Here (MVP)

- User onboarding (Web2-first): `docs/START_HERE.md`
- MVP scope and current behavior: `docs/MVP.md`
- Definition-of-done checklist: `docs/MVP_DOD.md`
- Current verified status: `docs/STATUS.md`
- Devnet audit snapshot: `docs/DEVNET_STATUS.md`
- Mass adoption roadmap: `docs/MASS_ADOPTION_ROADMAP.md`
- Adapter overview: `docs/ADAPTERS.md`
- Security model: `docs/THREAT_MODEL.md`
- Attack-mode behavior: `docs/ATTACK_MODE.md`
- Local resolver testing: `docs/LOCAL_TEST.md`
- Firefox TRR local test: `docs/FIREFOX_TRR.md`
- Canonical docs index: `docs/INDEX.md`

## 5 Minute Sanity Checks

```bash
npm ci && npm test
```

Optional gateway spot checks:

```bash
PORT=8054 npm -C gateway run start
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

## Quick Verify (Devnet)

```bash
npm -C solana run devnet:verify
npm -C solana run devnet:audit
```

Optional direct checks:

```bash
bash scripts/devnet_inventory.sh
```

## Quickstart (Local)

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
```

In another terminal:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

Expected:
- ICANN path returns recursive cache/quorum metadata.
- `.dns` path uses PKDNS behavior.

## One-command MVP Demo

```bash
npm run mvp:demo:devnet
```

Operator/developer proof command (not required for end users): strict funded flow with deploy-wave check, inventory, and strict `.dns` on-chain verification. It exits non-zero on strict failure.

## Become a Miner (Cloudflare Worker)

- Quickstart: `docs/MINER_QUICKSTART_CF.md`
- Onboarding page: `docs/miner-onboard/index.html`
- Deploy a miner in 3 minutes -> earn REP / TOLL (policy-governed by current MVP settings)

```bash
npm run miner:cf:dev
npm run miner:cf:deploy
```

Important: Wrangler cannot create Cloudflare accounts or bypass CAPTCHA/email verification. You must complete browser login once; deploy is automated after that.

## Why devs use this instead of raw DNS

- consistent JSON response
- cache confidence and upstream audit
- adapter proofs (.dns / IPFS / ENS / SNS)
- privacy-safe observations that strengthen network reliability
- developers can earn more by using our nameservers (toll share / discounts / credits / reduced registration and renewal costs; policy-governed)
- SDK examples (Node + Worker): `packages/sdk/examples/node.ts`, `packages/sdk/worker/example.ts`
- hosting from wallet domains (`.eth` / `.sol`) via IPFS/Arweave: `docs/HOSTING_FROM_WALLET_DOMAINS.md`

## Domain Continuity (Anti-Expiration Loss)

- Traditional registrars can let valuable domains expire after inbox failures and then auction those names.
- TollDNS provides continuity behavior: eligible domains remain reachable in a safe degraded mode with aggressive notifications while renewal is pending.
- Renewal can be reduced or covered through credits earned from using TollDNS nameservers; no crypto is required for users.
- This is expiration-loss protection, not a forever hold beyond registry rules.

See `docs/DOMAIN_CONTINUITY.md`.
Domain Continuity UI: `docs/DOMAIN_CONTINUITY_UI.md`.
Notice tokens: `docs/NOTICE_TOKENS.md`.
Banner/interstitial integration: `docs/DOMAIN_BANNER_INTEGRATION.md`.
Pricing model: `docs/WEB2_PRICING_MODEL.md`.
Payments + treasury policy: `docs/PAYMENTS_AND_TREASURY.md`.
Real registrar adapter flags: `REGISTRAR_ENABLED`, `REGISTRAR_PROVIDER`, `REGISTRAR_DRY_RUN` (off by default).

## Domain-owner earnings wedge (MVP accuracy)

Domain-owner/operator earnings are a core go-to-market wedge. In MVP, parts are policy-defined and some settlement paths are still bootstrap/centralized. Treat payouts as MVP policy plus incremental implementation, not guaranteed fixed returns.

## Roadmap (explicitly not all live)

Roadmap items below are planned unless stated as MVP in linked docs:
- premium naming and auction expansion (`docs/PREMIUM_AUCTIONS.md`)
- bonded hosting controls and abuse throttling (`docs/MASS_ADOPTION_ROADMAP.md`)
- load balancing + automatic Kubernetes deployment tiers (`docs/END_STATE.md`)
- AI guardrail workers for checks/backups/attestations (`docs/MASS_ADOPTION_ROADMAP.md`)
- registrar incentives and renewal-discount pathways (`docs/MASS_ADOPTION_ROADMAP.md`)

## Operator / Treasury / Maintenance (advanced)

These are not part of user onboarding:
- program deployment, devnet proof, and inventory: `DEVNET_RUNBOOK.md`, `docs/DEVNET_STATUS.md`
- reserve planning + rent bond accounting: `docs/RENT_BOND.md`
- strict demo proofs and artifacts: `docs/PROOF.md`, `VERIFIED.md`, `artifacts/devnet_inventory.json`
