# Operator Log

## 2026-02-18T08:12:45Z — Branch: codex/gateway-recursive-cache
- Scope: Add recursive DoH adapter + TTL cache path for non-.dns resolution in gateway.
- Commands run:
  -     \?? OPERATOR_LOG.md
  -     \codex/gateway-recursive-cache
  -     \
> ddns-resolver@0.1.0 test
> vitest run


 RUN  v4.0.18 /Users/root1/scripts/ddns-gateway-recursive/gateway

 ✓ tests/adapters_registry.test.ts (3 tests) 4ms
 ✓ tests/sns.test.ts (2 tests) 5ms
 ✓ tests/pkdns_adapter.test.ts (3 tests) 58ms
 ✓ tests/ens.test.ts (2 tests) 137ms
 ✓ tests/route_answer.test.ts (2 tests) 261ms
 ✓ tests/registry.test.ts (3 tests) 221ms
 ✓ tests/anchor.test.ts (1 test) 269ms
 ✓ tests/resolve.test.ts (5 tests) 270ms

 Test Files  8 passed (8)
      Tests  21 passed (21)
   Start at  00:12:45
   Duration  467ms (transform 512ms, setup 0ms, import 927ms, tests 1.23s, environment 1ms)
  -     \
> ddns-resolver@0.1.0 build
> tsc -p tsconfig.json
- Tests/build results:
  - gateway tests: PASS (8 files, 21 tests)
  - gateway build: PASS (tsc)
- PR link: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/55
- Merge commit hash: (to be added after merge)

## 2026-02-18T20:50:00Z — Branch: codex/pr-cache-rollup-ipfs-head
- Scope: Add chronological cache rollup + IPFS head MVP (`CacheEntryV1`, `cache-rollup` service, `ddns_cache_head`, `ddns_rep`, gateway emission hooks, docs).
- Commands run:
  - `npm -C gateway test`
  - `npm -C gateway run build`
  - `npm -C services/cache-rollup run build`
  - `cd solana && cargo generate-lockfile`
  - `cd solana && cargo check -p ddns_cache_head`
  - `cd solana && cargo check -p ddns_rep`
  - `cd solana && cargo test -p ddns_cache_head`
  - `cd solana && cargo test -p ddns_rep`
  - `cd solana && anchor build --program-name ddns_cache_head`
  - `cd solana && anchor build --program-name ddns_rep`
  - `cd solana && anchor test --skip-build`
- Tests/build results:
  - gateway tests/build: PASS
  - cache-rollup build: PASS
  - solana cargo checks/tests: PASS (`ddns_cache_head`, `ddns_rep`)
  - full Anchor TS suite: PASS (11 passing)
- PR link: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/72
- Merge commit hash: (to be added after merge)

## 2026-02-19T00:15:00Z — Branch: codex/main-ops
- Scope: Phase 0 stabilization + MVP merge audit and runbook docs.
- Commands run:
  - `git fetch origin --prune`
  - `gh run list --branch main -L 20 --json ...`
  - `npm ci && npm test`
  - `npm -C gateway test && npm -C gateway run build`
  - `npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build`
  - `cd solana && cargo generate-lockfile && anchor build`
  - `gh pr list --state open ...`
  - `gh pr checks 70 --json ...`
- Results:
  - main recent CI: PASS (latest runs successful)
  - local root test suite: PASS
  - gateway test/build: PASS
  - miner-witness test/build: PASS
  - solana cargo lockfile + anchor build: PASS
- Artifacts added:
  - `AUDIT_REPORT.md`
  - `DEVNET_RUNBOOK.md`
  - `CLOUDFLARE_DEPLOY.md`
  - README banner + merge guardrail command update

## 2026-02-19T00:24:00Z — Merge Operations
- PR #82 merged (squash): https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/82
  - Merge SHA: 2b7d8d2ffc72206f3163b72a974b67d361d4f824
  - Checks: all required CI checks PASS
  - Local verification: `bash scripts/validate-compat-mvp.sh` (skip path PASS)
- PR #78 merged (squash): https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/78
  - Merge SHA: aa90572bf46a728602a6a42bd129eddd72f919f2
  - Checks: all required CI checks PASS
  - Local verification: `npm -C gateway ci && npm -C gateway test && npm -C gateway run build` PASS
- PR #81 merged (squash): https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/81
  - Merge SHA: 4b808314d68c770e722bd62329ec253e54bd2f32
  - Checks: all required CI checks PASS
  - Local verification: docs-only; baseline smoke run on main (`npm -C gateway test && npm -C gateway run build`) PASS
- PR #70 closed as superseded by #82 after main compatibility behavior was confirmed.

## 2026-02-19T00:33:00Z — Cloudflare Miner Onboarding (Docs + Script)
- Scope: add MVP Cloudflare miner onboarding UI, quickstart docs, deploy script, and root npm commands.
- Commands run:
  - `git rebase --abort` (cleaned prior interrupted state)
  - `npm -C services/cf-worker-miner install`
  - `npm -C services/cf-worker-miner run dev -- --help`
  - `cd services/cf-worker-miner && npx wrangler deploy --dry-run`
- Results:
  - install: PASS (0 vulnerabilities)
  - wrangler dev help: PASS
  - wrangler deploy dry-run: PASS (bindings rendered, no auth needed for dry-run)
  - local endpoint checks via wrangler dev: PASS
    - `GET /v1/health` => `{"ok": true, "service": "cf-worker-miner"}`
    - `GET /resolve?name=netflix.com&type=A` => returned `confidence`, `upstreams_used`, `chosen_upstream`, `rrset_hash`, `answers`, `ttl_s`
- Files added/updated:
  - `services/cf-worker-miner/{package.json,wrangler.toml,src/index.js,README.md}`
  - `scripts/cf_miner_deploy.sh`
  - `docs/MINER_QUICKSTART_CF.md`
  - `docs/miner-onboard/index.html`
  - `README.md`
  - `package.json` (root scripts)
  - `services/miner-witness/VERIFIED.md`

## 2026-02-19T00:44Z — Devnet deploy + funding audit scripts

- Branch: `codex/main-ops`
- Scope: add `solana/scripts/devnet_verify_deployed.ts`, `solana/scripts/devnet_audit.ts`, package scripts, `docs/MVP_DOD.md`, update `solana/VERIFIED.md`.

Commands run:

```bash
npm -C solana i --include=dev
npm -C solana run devnet:verify
npm -C solana run devnet:audit
```

Results:

- `devnet:verify`: `✅ all required programs are deployed (6)`
- `devnet:audit`: generated `docs/DEVNET_STATUS.md`
  - programs audited: 15
  - total program SOL: 0.006848640
  - deploy wallet SOL: 11.945643640
  - recommended reserve SOL: 5.000000000 (OK)

## 2026-02-19T03:05:00Z — Priority Block Refresh (Baseline + Devnet + Happy Path + Audit)

- Branch: `codex/priority-block-clean`
- Scope: rerun clean-main baseline smoke, refresh devnet inventory/rent report, add one-command devnet happy-path script, refresh `AUDIT_REPORT.md`.

Commands run:

```bash
git fetch origin --prune
git worktree add /tmp/ddns-priority-block-clean -b codex/priority-block-clean origin/main
npm ci
npm test
npm -C solana i
npm -C solana run devnet:verify
npm -C solana run devnet:audit
npm run mvp:demo:devnet
```

Results:

- Baseline smoke: PASS (`npm test` => `run_all: complete`)
- Devnet verify: PASS (`✅ all required programs are deployed (6)`)
- Devnet audit: PASS (`docs/DEVNET_STATUS.md` refreshed)
  - programs audited: 16
  - total SOL in program accounts: 0.007990080
  - deploy wallet SOL: 11.945643640
  - recommended reserve SOL: 5.000000000 (OK)
- One-command happy path: PASS with blocker visibility (`✅ demo complete`)
  - ICANN resolve path works in gateway
  - Known blocker: tollbooth route flow returns `offset out of range` and `.dns` route assignment does not complete

Consistency rule carried forward:
- For every future squash merge log: record `PR #`, `squash commit SHA on main`, and final smoke commands with pass/fail.
