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

## Devnet Inventory

Date (UTC): 2026-02-19T03:56:19Z  
RPC: `https://api.devnet.solana.com`  
Wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`

Command run:

```bash
bash scripts/devnet_inventory.sh
```

Output snippet:

```text
solana balance: 0.02432396 SOL

[ddns_anchor] 9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes
owner: BPFLoaderUpgradeab1e11111111111111111111111
upgrade_authority: B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5
programdata_address: rgQTn2mWkpck5zBNeAHwk8P3aADMbhNeTGWTgBPwJEK
executable: true
lamports: 1141440
sol: 0.001141440

total_program_sol: 0.007990080
recommended_wallet_topup_sol: 4.975676040
```

## Devnet Inventory (authoritative tool)

Date (UTC): 2026-02-19T04:31:36Z  
Branch: `codex/devnet-inventory`  
Worktree: `/private/tmp/ddns-devnet-inventory`

Command run from clean worktree:

```bash
npm run devnet:inventory
```

Output snippet:

```text
# Devnet Inventory
- rpc: https://api.devnet.solana.com
- wallet: B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5

## Program Inventory (Anchor.toml [programs.devnet])
| Program | Tier | ... | Exists | Executable | ... | Status |
| ddns_anchor | REQUIRED | ... | yes | yes | ... | ok |
| ddns_escrow | REQUIRED | ... | no  | no  | ... | missing |
| ddns_miner_score | REQUIRED | ... | no | no | ... | missing |
| ddns_cache_head | REQUIRED | ... | no | no | ... | missing |

## Key Demo PDAs / Vaults (rent + top-up guidance)
| ddns_anchor:config | ... | Exists: yes | Rent Exempt Lamports: 1197120 | Recommended Top-up Lamports: 0 |
| ddns_witness_rewards:config | ... | Exists: yes | Rent Exempt Lamports: 1941840 | Recommended Top-up Lamports: 0 |

required_failures: ddns_cache_head, ddns_escrow, ddns_miner_score
EXIT_CODE:1
```

Artifact generated:

- `artifacts/devnet_inventory.json`

## Phase 0 Demo Command Wiring (mvp:demo:devnet)

Date (UTC): 2026-02-19  
Branch: `codex/phase0-demo-script`

### Command

```bash
npm run mvp:demo:devnet
```

### Output snippet

```text
> decentralized-dns@1.0.0 mvp:demo:devnet
> npm -C solana ci --include=dev && npm -C solana run devnet:verify && npm -C solana run devnet:audit

npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory.
npm warn deprecated glob@8.1.0: Old versions of glob are not supported.

added 247 packages, and audited 249 packages in 3s

> ddns-anchor@0.1.0 devnet:verify
> tsx scripts/devnet_verify_deployed.ts --rpc https://api.devnet.solana.com

✅ all required programs are deployed (6)

> ddns-anchor@0.1.0 devnet:audit
> tsx scripts/devnet_audit.ts --rpc https://api.devnet.solana.com

Wrote /private/tmp/ddns-pr94/docs/DEVNET_STATUS.md
Programs audited: 16
Recommended reserve SOL: 5.000000000 (WARNING: below recommended reserve; upgrades may fail)
EXIT_CODE:0
```
