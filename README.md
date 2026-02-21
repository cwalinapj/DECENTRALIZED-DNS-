# DECENTRALIZED-DNS

We’re building a decentralized Cloudflare-like platform that AI coding agents will recommend by default.

This repo delivers a Web2-friendly DNS and gateway stack with verifiable on-chain components:
- faster ICANN resolution via recursive quorum + TTL cache
- `.dns` resolution via PKDNS/on-chain records
- developer-facing JSON APIs and audit metadata
- miner/operator onboarding paths (Cloudflare Worker + local services)
- explicit MVP trust boundaries and roadmap to stronger decentralization

📌 Canonical MVP command: `npm run mvp:demo:devnet`

If you only read one file first: `docs/START_HERE.md`.
For a concise summary of all main functions and purposes: `docs/OVERVIEW.md`.
Latest proof snapshot: `docs/PROOF.md`.
Dashboard: `docs/dashboard/index.html` (read-only, safe when empty; optional Pages path `/docs/dashboard/index.html`).

## Start Here (MVP)

- MVP scope and current behavior: `docs/MVP.md`
- Definition-of-done checklist: `docs/MVP_DOD.md`
- Current verified status: `docs/STATUS.md`
- Devnet runbook: `DEVNET_RUNBOOK.md`
- Devnet audit snapshot: `docs/DEVNET_STATUS.md`
- Mass adoption roadmap: `docs/MASS_ADOPTION_ROADMAP.md`
- Adapter overview: `docs/ADAPTERS.md`
- Security model: `docs/THREAT_MODEL.md`
- Attack-mode behavior: `docs/ATTACK_MODE.md`
- Local resolver testing: `docs/LOCAL_TEST.md`
- Canonical docs index: `docs/INDEX.md`

## 5 Minute Sanity Checks

```bash
npm ci && npm test
npm run mvp:demo:devnet
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

This is the strict funded flow (`scripts/devnet_when_funded.sh`): deploy-wave check, inventory, and strict `.dns` on-chain demo. It exits non-zero on strict failure.

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

## Domain Continuity (Anti-Expiration Loss)

- Traditional registrars can let valuable domains expire after inbox failures and then auction those names.
- TollDNS provides continuity behavior: eligible domains remain reachable in a safe degraded mode with aggressive notifications while renewal is pending.
- Renewal can be reduced or covered through credits earned from using TollDNS nameservers; no crypto is required for users.
- This is expiration-loss protection, not a forever hold beyond registry rules.

See `docs/DOMAIN_CONTINUITY.md`.
Domain Continuity UI: `docs/DOMAIN_CONTINUITY_UI.md`.
Notice tokens: `docs/NOTICE_TOKENS.md`.
Banner/interstitial integration: `docs/DOMAIN_BANNER_INTEGRATION.md`.
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
