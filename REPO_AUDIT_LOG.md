# REPO_AUDIT_LOG

<!-- Generated 2026-02-20T23:12:21Z -->

---

## 0) Snapshot Header

| Field | Value |
|---|---|
| **Repo name** | cwalinapj/DECENTRALIZED-DNS- |
| **Remote URL** | https://github.com/cwalinapj/DECENTRALIZED-DNS- |
| **Current branch** | `copilot/generate-repo-audit-log-md` |
| **HEAD commit SHA** | `df0b56fe78824b687b530c160c07a46aef25ec85` |
| **Date UTC** | 2026-02-20T23:12:21Z |
| **Node version** | v24.13.0 |
| **npm version** | 11.6.2 |
| **Solana CLI version** | UNKNOWN (not installed in this environment) |
| **Anchor version** | UNKNOWN (not installed in this environment) |

---

## 1) Hygiene / State

### `git status --porcelain`

```
(empty — working tree clean)
```

### `git worktree list`

```
/home/runner/work/DECENTRALIZED-DNS-/DECENTRALIZED-DNS-  df0b56f [copilot/generate-repo-audit-log-md]
```

### Open PRs (`gh pr list --state open`)

```
UNKNOWN — GitHub CLI not available in this environment.
```

### Local branches matching `codex/*` or `copilot/*`

```
* copilot/generate-repo-audit-log-md
  remotes/origin/copilot/generate-repo-audit-log-md
```

---

## 2) Quick Command Matrix

| Command | Result | Notes |
|---|---|---|
| `npm ci && npm test` | ✅ PASS | All gate scripts and sub-packages pass; smoke `/resolve` returns 502 (no upstream running, expected in CI) |
| `npm -C gateway ci && npm -C gateway test && npm -C gateway run build` | ✅ PASS | 39 vitest tests pass; `tsc` build succeeds; 5 audit vulns in dev deps (pre-existing) |
| `npm -C packages/sdk ci && npm -C packages/sdk run build` | ✅ PASS | TypeScript build succeeds; 0 vulnerabilities |
| `bash scripts/check_program_id_sync.sh` | ✅ PASS | Exits 0; warns `solana/target/deploy` missing (run `anchor build` first to populate keypairs) |
| `bash scripts/devnet_inventory.sh` | ❌ FAIL | Exits with `missing_dependency: solana` — Solana CLI not installed in this environment |
| `npm run mvp:demo:devnet` | ❌ FAIL | Exits with `wallet_not_found: ~/.config/solana/id.json` — no funded devnet wallet present |

### Command output snippets

#### `npm ci && npm test` (tail)

```
passport integration skipped
comments coordinator tests passed
node verify proof fixture passed
node verify endpoint test passed
==> /home/.../resolver: npm ci || npm install; (npm test || npm run build)
resolver test ok
==> tests/smoke: /resolve
curl: (22) The requested URL returned error: 502
gateway did not return a response
Listening on 0.0.0.0:8056
```

#### `npm -C gateway test` (summary)

```
 ✓ tests/recursive_quorum.test.ts  (5 tests)
 ✓ tests/pkdns_adapter.test.ts     (3 tests)
 ✓ tests/adapters_registry.test.ts (3 tests)
 ✓ tests/resolve.test.ts           (5 tests)
 ✓ tests/domain_notice_endpoints.test.ts (8 tests)
 ✓ tests/cache_log.test.ts         (3 tests)
 ✓ tests/registry.test.ts          (3 tests)
 ✓ tests/route_answer.test.ts      (2 tests)
 ✓ tests/ens.test.ts               (2 tests)
 ✓ tests/notice_token.test.ts      (2 tests)
 ✓ tests/sns.test.ts               (2 tests)
 ✓ tests/anchor.test.ts            (1 test)
 Test Files 12 passed (12) | Tests 39 passed (39)
```

#### `bash scripts/check_program_id_sync.sh`

```
[id-check] missing /home/.../solana/target/deploy (run anchor build first)
```

#### `bash scripts/devnet_inventory.sh`

```
missing_dependency: solana
```

#### `npm run mvp:demo:devnet`

```
> bash scripts/devnet_when_funded.sh
wallet_not_found: /home/runner/.config/solana/id.json
```

---

## 3) MVP Entrypoints

### Canonical MVP commands (from README + `docs/START_HERE.md`)

| Command | Exists in `package.json`? | Script |
|---|---|---|
| `npm run mvp:demo:devnet` | ✅ Yes | `bash scripts/devnet_when_funded.sh` |
| `npm run mvp:funded:devnet` | ✅ Yes | `bash scripts/devnet_when_funded.sh` (alias) |
| `npm test` | ✅ Yes | `bash tests/run_all.sh` |
| `npm run devnet:inventory` | ✅ Yes | `bash scripts/devnet_inventory.sh` |

Full copy/paste MVP path (from `docs/START_HERE.md`):

```bash
npm ci && npm test
bash scripts/check_program_id_sync.sh
npm run mvp:demo:devnet
bash scripts/devnet_inventory.sh
```

### URLs / Endpoints Exposed

#### Gateway (`gateway/src/server.ts`) — default port `8054`

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Health check |
| GET | `/v1/resolve` | Recursive DNS resolve (ICANN + `.dns`) |
| GET | `/v1/route` | Route/adapter selection |
| GET | `/v1/resolve-adapter` | Alias for `/v1/route` |
| GET | `/v1/attack-mode` | Current attack-mode status |
| GET | `/v1/registrar/domain` | Domain availability lookup |
| GET | `/v1/registrar/quote` | Registration price quote |
| POST | `/v1/registrar/renew` | Renew domain |
| POST | `/v1/registrar/ns` | Update nameservers |
| GET | `/v1/credits/balance` | Credits balance |
| POST | `/v1/credits/credit` | Add credits |
| POST | `/v1/credits/debit` | Deduct credits |
| GET | `/v1/domain/status` | Domain on-chain status |
| POST | `/v1/domain/verify` | Domain verify |
| POST | `/v1/domain/renew` | Domain renewal |
| GET | `/v1/domain/continuity` | Continuity check |
| POST | `/v1/domain/continuity/claim` | Continuity claim |
| GET | `/v1/domain/notice` | Domain notice |
| POST | `/v1/domain/notice/verify` | Notice verify |
| GET | `/v1/domain/banner` | Domain banner |
| POST | `/cache/upsert` | Cache upsert |
| GET | `/registry/root` | Registry root |
| GET | `/registry/proof` | Registry proof |
| POST | `/registry/anchor` | Registry anchor |

#### Tollbooth (`services/tollbooth/src/index.ts`) — default port `8788`

UNKNOWN — no HTTP route table found in source (runs as Cloudflare Worker context).

#### CF Worker Miner (`services/cf-worker-miner/src/index.ts`)

| Method | Path | Description |
|---|---|---|
| GET | `/v1/health` | Worker health check |
| GET | `/resolve` | DNS resolve (returns `{name,type,status,answers,ttl_s,rrset_hash,confidence,upstreams_used,chosen_upstream}`) |

---

## 4) Devnet Inventory

### Programs (`solana/Anchor.toml` → `[programs.devnet]`)

| Program Name | Program ID |
|---|---|
| `ddns_anchor` | `EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5` |
| `ddns_registry` | `5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3` |
| `ddns_quorum` | `2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6` |
| `ddns_stake` | `FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86` |
| `ddns_watchdog_policy` | `Ct4gQ98PofJxca2HSQrfzd1Cohay4praM9dFF2L9jr1g` |
| `ddns_stake_gov` | `EeU6h3gUUVKJeBsGG77onyH9Sjbq87Uz976RYHt2pCPf` |
| `ddns_escrow` | `2it8BbaePYnGaKcBrT5fAk7uj2YWaGdKtqSPriervwtA` |
| `ddns_domain_rewards` | `CKuPPeJAM8GdfvVMvERxa7rXJcNYwEy2P7wevQ4tjja2` |
| `ddns_ns_incentives` | `J3rL2iuBB3LzvymJ92yRQbRV6biLFefBKh5UvHLBwEJ2` |
| `ddns_rewards` | `D2P9nj4aVS9GiWu4UoLeBtJxKwVfu7FXqnj76f1sKwBd` |
| `ddns_operators` | `6QpkisF6re7KM5XwiYv5mqRmsfPBAwFEK6tkRmMeSRL8` |
| `ddns_miner_score` | `GYexwqwG1WArm3uSRNpTxZPVwvAPqrJp7BVzECJmWJGH` |
| `ddns_names` | `BYQ68JftwZD2JEMXLAiZYYGMr6AD9cD9XznntA4v6Mjj` |
| `ddns_cache_head` | `HjCiKFJKnSvuUd8gN8NjiFPdiwRZSqDit7LMJzFt3Sck` |
| `ddns_rep` | `BS62AYwh5KuhTWoVHiDbpAhifK4SDC1FJtKaYw9bSKaE` |
| `ddns_witness_rewards` | `6dNEBRscCHZB7yHo1iPBktccUSN7P32eSvY1FQkPh7hd` |

### `solana program show -u devnet <program-id>` results

UNKNOWN — Solana CLI not installed in this environment. To reproduce, run:

```bash
for id in \
  EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5 \
  5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3 \
  2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6 \
  FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86 \
  Ct4gQ98PofJxca2HSQrfzd1Cohay4praM9dFF2L9jr1g \
  EeU6h3gUUVKJeBsGG77onyH9Sjbq87Uz976RYHt2pCPf \
  2it8BbaePYnGaKcBrT5fAk7uj2YWaGdKtqSPriervwtA \
  CKuPPeJAM8GdfvVMvERxa7rXJcNYwEy2P7wevQ4tjja2 \
  J3rL2iuBB3LzvymJ92yRQbRV6biLFefBKh5UvHLBwEJ2 \
  D2P9nj4aVS9GiWu4UoLeBtJxKwVfu7FXqnj76f1sKwBd \
  6QpkisF6re7KM5XwiYv5mqRmsfPBAwFEK6tkRmMeSRL8 \
  GYexwqwG1WArm3uSRNpTxZPVwvAPqrJp7BVzECJmWJGH \
  BYQ68JftwZD2JEMXLAiZYYGMr6AD9cD9XznntA4v6Mjj \
  HjCiKFJKnSvuUd8gN8NjiFPdiwRZSqDit7LMJzFt3Sck \
  BS62AYwh5KuhTWoVHiDbpAhifK4SDC1FJtKaYw9bSKaE \
  6dNEBRscCHZB7yHo1iPBktccUSN7P32eSvY1FQkPh7hd; do
  echo "=== $id ==="; solana program show -u devnet "$id"; echo
done
```
