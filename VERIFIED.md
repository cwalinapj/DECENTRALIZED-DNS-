# Dependency Refresh Verification

Date (UTC): 2026-02-19
Branch: `codex/deps-refresh`
Base: `origin/main`

## Scope
- Patch/minor dependency refresh only (`npm update` + `npm audit fix` without `--force`)
- No major upgrades accepted
- No product-feature changes

## Commands Run

### Baseline (before updates)
```bash
npm ci
npm test
npm -C gateway test && npm -C gateway run build
npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build
npm -C packages/attack-mode ci && npm -C packages/attack-mode test && npm -C packages/attack-mode run build
cd solana && npm i && anchor build && cargo generate-lockfile && cd ..
```
Result: PASS (`run_all: complete`, gateway/miner-witness/attack-mode/solana checks passed).

`services/cf-worker-miner` note: not present on clean `origin/main`, so not applicable in this PR.

### Refresh pass
```bash
npm -C . update && npm -C . audit fix || true
npm -C gateway update && npm -C gateway audit fix || true
npm -C solana update && npm -C solana audit fix || true
npm -C packages/attack-mode update && npm -C packages/attack-mode audit fix || true
npm -C services/cache-rollup update && npm -C services/cache-rollup audit fix || true
npm -C services/miner-witness update && npm -C services/miner-witness audit fix || true
npm -C services/toll-booth update && npm -C services/toll-booth audit fix || true
npm -C services/tollbooth update && npm -C services/tollbooth audit fix || true
npm -C services/witness-gateway update && npm -C services/witness-gateway audit fix || true
```

### Post-refresh guardrails
```bash
npm ci
npm test
npm -C gateway test && npm -C gateway run build
npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build
npm -C packages/attack-mode ci && npm -C packages/attack-mode test && npm -C packages/attack-mode run build
cd solana && npm i && anchor build && cargo generate-lockfile && cd ..
```
Result: PASS (`run_all: complete`, explicit package checks passed).

## Deferred Majors (not applied)
From `npm audit fix` output, fixes required breaking major changes and were intentionally deferred:
- `gateway` / `solana` / `services/tollbooth`: `bigint-buffer` advisory chain would require breaking downgrade/major changes in Solana token stack.
- `packages/attack-mode` and `services/miner-witness`: `esbuild` advisory fix requires `vitest@4` major upgrade.
- `solana`: `minimatch` advisory chain would require breaking `mocha` major change.

## Diff Summary
```bash
git diff --stat
```
Changed files:
- `gateway/package-lock.json`
- `services/miner-witness/package-lock.json`
- `services/toll-booth/package-lock.json`
- `services/tollbooth/package-lock.json`
- `services/witness-gateway/package-lock.json`
- `solana/package-lock.json`

No secrets/keypairs were added.

## Cloudflare Worker Miner (MVP)

Date (UTC): 2026-02-19
Branch: `codex/pr-cf-worker-miner-readd`

### Commands run

```bash
npm -C services/cf-worker-miner i
npm -C services/cf-worker-miner run build
npm run miner:cf:dev -- --help
npm run miner:cf:deploy -- --help
```

### Output snippets

- `npm -C services/cf-worker-miner i`
  - `FAIL` in this environment due local `esbuild` postinstall binary execution (`SyntaxError: Invalid or unexpected token` under `node v24.10.0`).
- `npm -C services/cf-worker-miner run build`
  - `PASS`
  - `wrangler deploy --dry-run`
  - shows bindings for `UPSTREAMS`, `TIMEOUT_MS`, `OVERLAP_RATIO`, then exits on `--dry-run`.
- `npm run miner:cf:dev -- --help`
  - `FAIL` here because the script runs `npm i` first and hits the same `esbuild` postinstall error.
- `npm run miner:cf:deploy -- --help`
  - `FAIL` here because the script runs `npm i` first and hits the same `esbuild` postinstall error.

### Files added/updated for this PR scope

- `services/cf-worker-miner/src/index.ts`
- `services/cf-worker-miner/wrangler.toml`
- `services/cf-worker-miner/package.json`
- `services/cf-worker-miner/README.md`
- `docs/MINER_QUICKSTART_CF.md`
- `docs/miner-onboard/index.html`
- `package.json` (root scripts: `miner:cf:dev`, `miner:cf:deploy`)

## README + Docs Reality Sync

Date (UTC): 2026-02-19
Branch: `codex/readme-reality-sync`
Base: `origin/main`

### Scope
- Restructured root README for accurate MVP-first onboarding.
- Added canonical local test doc: `docs/LOCAL_TEST.md`.
- Set docs index canonical: `docs/INDEX.md` (with `docs/README.md` pointer).
- Set status canonical: `docs/STATUS.md` (with root `STATUS.md` pointer).
- Added root one-command demo script: `mvp:demo:devnet`.
- Added reference audit table: `docs/ops/README_REALITY_AUDIT.md`.

### Commands run

```bash
npm ci && npm test
```
Result: PASS
Snippet:
```text
ROOT_EXIT:0
==> run_all: complete
```

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
```
Result: PASS
Snippet:
```text
CI_RC:0 BUILD_RC:0 CURL_RC:0
{"name":"netflix.com","type":"A","answers":[...],"source":"recursive","confidence":"low",...}
```

```bash
npm run mvp:demo:devnet
```
Result: PASS
Snippet:
```text
DEMO_RC:0
✅ all required programs are deployed (6)
Wrote /private/tmp/ddns-readme-sync/docs/DEVNET_STATUS.md
```

### Referenced-path check (README)
All file-path references in `README.md` resolve to existing files in this branch.
