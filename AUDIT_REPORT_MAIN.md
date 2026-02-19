# Main Audit Report (origin/main)

## 1) Executive Summary
- MVP runnable? **Partial** (devnet is documented; local run works for gateway; miner-witness tests fail locally).
- Gateway resolves `.dns` + ICANN? **Yes** (gateway tests pass; recursive quorum + PKDNS path).
- Cloudflare miner onboarding present? **Yes** (docs + onboarding UI + worker starter).
- Devnet programs verified deployed? **Yes, per `docs/DEVNET_STATUS.md` generated 2026-02-19** (not re-verified in this audit run).
- CI green on main? **Yes** (latest `main` CI run success).

## 2) What Exists Today

**Gateway**
- Recursive resolver with multi-upstream quorum, TTL cache, stale-if-error.
- .dns PKDNS adapter with verify/resolve path.
- Endpoints: `/v1/resolve`, `/v1/route`, `/v1/resolve-adapter`, `/dns-query`, `/v1/attack-mode`, registry endpoints.

**Adapters (PKDNS/IPFS/ENS/SNS/etc)**
- Implemented: PKDNS, IPFS, ENS (read-only), SNS (read-only).
- Stubs: Handshake, Filecoin, Arweave.

**Recursive Quorum + TTL Cache**
- In gateway adapter; confidence levels + upstream audit, TTL clamps, stale-if-error.

**Miner Witness Service + Attack Mode**
- Miner witness service present with `/v1/submit-receipts` and `/v1/health`.
- Attack-mode module exists in `packages/attack-mode`.

**Tollbooth**
- Tollbooth service and toll-booth variant present with route submission and resolution endpoints.

**Cloudflare Worker Miner Starter**
- `services/cf-worker-miner` worker with deploy docs + onboarding page.
- `docs/MINER_QUICKSTART_CF.md` + `docs/miner-onboard/index.html`.

**Solana Programs (Anchor)**
- `ddns_anchor`: base anchor scaffold / identity helpers.
- `ddns_registry`: canonical route records.
- `ddns_quorum`: aggregate submissions + finalization.
- `ddns_stake`: staking + rewards (legacy).
- `ddns_stake_gov`: governance stake, lockups, slashing.
- `ddns_watchdog_policy`: watchdog policy state.
- `ddns_escrow`: voucher-based toll settlement.
- `ddns_domain_rewards`: domain owner + miners + treasury split.
- `ddns_ns_incentives`: nameserver incentives program.
- `ddns_rewards`: rewards bookkeeping.
- `ddns_operators`: operator marketplace.
- `ddns_miner_score`: miner scoring + rewards.
- `ddns_names`: .dns identity + premium name logic (non-transferable subdomains by default).
- `ddns_cache_head`: on-chain cache head for rollups.
- `ddns_rep`: non-transferable reputation points.
- `ddns_witness_rewards`: bonded, permissionless receipt batch rewards.

**Docs / Runbooks / Quickstarts**
- `DEVNET_RUNBOOK.md`, `docs/MVP.md`, `docs/MVP_DOD.md`, `docs/DEVNET_STATUS.md`.
- `docs/MINER_QUICKSTART_CF.md`, `CLOUDFLARE_DEPLOY.md`.
- Protocol docs: cache witness, watchdog attestations, cache log, adapters, etc.

## 3) What’s Missing / Incomplete

- **Miner-witness tests fail locally** due to unresolved `@ddns/attack-mode` package entry in `services/miner-witness` (see Risks).
- **Toll-booth service missing test script** (npm test fails with “Missing script: test”).
- **Adapter stubs**: Handshake, Filecoin, Arweave are not implemented.
- **Voucher / escrow verification**: `gateway/src/voucher.ts` defaults to stub mode (`VOUCHER_MODE=stub`).
- **Cache rollup to IPFS**: `services/cache-rollup` uses stub CID in MVP fallback.
- **Witness-gateway IPFS flush**: stubbed CID in `services/witness-gateway`.
- **Devnet deploy coverage**: `docs/DEVNET_STATUS.md` shows multiple programs missing on devnet (watchdog, stake_gov, escrow, ns_incentives, operators, miner_score, names, cache_head, rep, witness_rewards).
- **One-command devnet happy-path**: no single script to run full end-to-end demo.
- **Centralization assumptions**: allowlisted miners/verifiers and centralized gateway/tollbooth are still present in MVP.

## 4) MVP Definition-of-Done Gap Check (from `docs/MVP_DOD.md`)

- `devnet:verify` + `devnet:audit` run ✅ (per `docs/DEVNET_STATUS.md` generated 2026-02-19; not re-run in this audit)
- Root baseline: `npm ci` ✅
- Root baseline: `npm test` ✅
- Gateway: `npm -C gateway test` ✅
- Gateway: `npm -C gateway run build` ✅
- Miner-witness: `npm -C services/miner-witness test` ❌ (fails: `@ddns/attack-mode` package entry resolution)
- Miner-witness: `npm -C services/miner-witness run build` ⚠️ (not run due to test failure)
- Solana: `anchor build` ✅
- Solana: `cargo generate-lockfile` ✅

## 5) Risks + Blockers (ranked)

1) **Miner-witness test failure blocks MVP baseline**
- Command:
  ```bash
  npm -C services/miner-witness test
  ```
- Error excerpt:
  ```text
  Failed to resolve entry for package "@ddns/attack-mode".
  ```
- Root cause guess:
  - `@ddns/attack-mode` package exports/entry mismatch or dependency not linked in `services/miner-witness` bundler config. Likely `packages/attack-mode` build artifacts not referenced correctly.
  - File: `services/miner-witness/src/index.ts` import resolution.
- Minimal fix:
  1. Ensure `packages/attack-mode` is built and exposes correct `main/module/exports`.
  2. Update `services/miner-witness` build/test config to resolve workspace package.
  3. Re-run `npm -C services/miner-witness test`.

2) **Toll-booth missing test script**
- Command:
  ```bash
  npm -C services/toll-booth test
  ```
- Error excerpt:
  ```text
  npm error Missing script: "test"
  ```
- Root cause guess:
  - `services/toll-booth/package.json` lacks test script.
- Minimal fix:
  1. Add a stub test script or CI guard (skip if no tests).
  2. Update CI expectations to avoid fail on missing test.

3) **Devnet coverage incomplete**
- Evidence: `docs/DEVNET_STATUS.md` shows many programs missing on devnet (watchdog, stake_gov, escrow, ns_incentives, operators, miner_score, names, cache_head, rep, witness_rewards).
- Minimal fix:
  1. Decide which subset is required for MVP.
  2. Deploy only the required MVP subset; update `devnet:verify` list accordingly.

## 6) Recommended Next Steps (ranked)

1) **Fix miner-witness test resolution** (S)
- Where: `services/miner-witness`, `packages/attack-mode`
- Acceptance test: `npm -C services/miner-witness test` passes.
- Why: blocks MVP DOD baseline.

2) **Add toll-booth test script or CI skip** (S)
- Where: `services/toll-booth/package.json`
- Acceptance test: `npm -C services/toll-booth test` does not error.
- Why: reduces CI friction and DOD ambiguity.

3) **Run `devnet:verify` and `devnet:audit` on current main** (S)
- Where: `solana/scripts/devnet_verify_deployed.ts`, `solana/scripts/devnet_audit.ts`
- Acceptance test: regenerate `docs/DEVNET_STATUS.md`.
- Why: ensures devnet status is current and accurate.

4) **Define MVP-required program list** (S)
- Where: `solana/scripts/devnet_verify_deployed.ts` / docs
- Acceptance test: `npm -C solana run devnet:verify` passes against that list.
- Why: keeps scope minimal and clear.

5) **Create a single devnet happy-path script** (M)
- Where: `scripts/devnet_happy_path.sh` or `solana/scripts/` + gateway script
- Acceptance test: “✅ demo complete” output.
- Why: makes repo feel runnable for new users.

6) **Harden voucher flow out of stub mode** (M)
- Where: `gateway/src/voucher.ts`, `docs/VOUCHER_ESCROW.md`
- Acceptance test: voucher verify path wired to escrow or explicit stub bypass.
- Why: prevents silent placeholder behavior in MVP.

7) **Implement at least one non-stub adapter** (M)
- Where: `gateway/src/adapters/handshake.ts` or `filecoin.ts`
- Acceptance test: adapter returns non-null in unit tests.
- Why: increases real-world interoperability.

8) **Reconcile duplicate toll-booth/tollbooth services** (M)
- Where: `services/toll-booth` vs `services/tollbooth`
- Acceptance test: one canonical service and docs.
- Why: reduces confusion and maintenance burden.

9) **Add gateway client SDK stub** (M)
- Where: `packages/` (new `@ddns/sdk`)
- Acceptance: example usage returns consistent JSON.
- Why: developer adoption.

10) **Document centralization assumptions explicitly** (S)
- Where: `docs/MVP.md`, `README.md`
- Acceptance: clear list of allowlists and centralized components.
- Why: trust clarity.

## 7) “One-command Happy Path” Feasibility
- **Not ready**. There is a manual devnet runbook and scripts, but no single script that deploys/verifies, configures PDAs, and runs a full resolve + reward flow.
- Missing: a cohesive script that chains gateway, devnet verification, and witness submission/claim.

## 8) Appendices

### Command Log (PASS/FAIL)
- `npm ci` ✅
- `npm test` ✅
- `npm -C gateway i` ✅
- `npm -C gateway test` ✅
- `npm -C gateway run build` ✅
- `npm -C services/miner-witness ci` ✅
- `npm -C services/miner-witness test` ❌ (`@ddns/attack-mode` resolution)
- `npm -C services/toll-booth ci` ✅
- `npm -C services/toll-booth test` ❌ (missing script)
- `npm -C services/cf-worker-miner i` ✅
- `npm -C services/cf-worker-miner run build` ✅
- `cd solana && npm i` ✅
- `cd solana && anchor --version` ✅ (0.32.1)
- `cd solana && solana --version` ✅ (3.0.13)
- `cd solana && anchor build` ✅
- `cd solana && cargo generate-lockfile` ✅
- `cd solana && cargo test --workspace --all-targets` ✅ (warnings only)

### Program IDs (from `solana/Anchor.toml` `[programs.devnet]`)
- ddns_anchor: `9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes`
- ddns_registry: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- ddns_quorum: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`
- ddns_stake: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`
- ddns_watchdog_policy: `6iveVkjqRiVpbSM3GmktMhGvqN7WConK5NrM6tvRZnnc`
- ddns_stake_gov: `86XQF9V51Z8L8MLUP7yMU6ZWPzfaK1nhFsr3Hd8mYFgt`
- ddns_escrow: `4jtDN5gqUqpmu1nBfLwPBAz8jBYjP6Nba4yZ8Am75M2J`
- ddns_domain_rewards: `7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m`
- ddns_ns_incentives: `8mC8Kvky9Jir4Lxe5R5L6ppoexaYtDJKe8JP8xA9JUuM`
- ddns_rewards: `8GQJrUpNhCFodqKdhEvWub6pjTtgoXBtBZUqxeEDujAY`
- ddns_operators: `3Q5VCoAT4TZ9xMrpbt4jbN9LhHfihxGH3TiD6PmSqHhp`
- ddns_miner_score: `37yrHgDgALGe4fUwWhJigQfD95jPFd9g2fDuYHkPAYaS`
- ddns_names: `BJgHrrTukutZPWxMDNdd6SXe2A7UzX56Qru6uKfVeHjK`
- ddns_cache_head: `J3LCbeg9ocpGcGWdAAFjM8N4G7FTU9na1Lhe5VHBivZt`
- ddns_rep: `FAPdRsatJoucFL6h1XQAQnQYN9KRxp7m2vzLLwnNmuLb`
- ddns_witness_rewards: `AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge`

### Endpoint Summary
**Gateway** (`gateway/src/server.ts`)
- `GET /healthz`
- `GET /v1/attack-mode`
- `GET /v1/route`
- `GET /v1/resolve-adapter`
- `GET /v1/resolve`
- `POST /cache/upsert`
- `GET /registry/root`
- `GET /registry/proof`
- `POST /registry/anchor`
- `GET /resolve`
- `GET /dns-query`
- `POST /dns-query`

**Services**
- `services/miner-witness`: `GET /v1/health`, `POST /v1/submit-receipts`
- `services/cache-rollup`: `GET /v1/health`, `POST /v1/ingest`, `POST /v1/rollup`, `GET /v1/cache-head`
- `services/witness-gateway`: `GET /v1/health`, `POST /v1/flush`
- `services/tollbooth`: `GET /v1/challenge`, `POST /v1/claim-passport`, `POST /v1/assign-route`, `GET /v1/resolve`
- `services/toll-booth`: `POST /v1/route/submit`, `GET /v1/route/:route_id`, `GET /v1/attack-mode`

### Branch / Commit Audited
- Branch: `origin/main`
- Commit: `9f8eeeb`
