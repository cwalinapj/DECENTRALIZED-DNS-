# AUDIT_REPORT

Generated: 2026-02-19T00:23:42Z

## Baseline
- main head: aa90572
- Baseline local checks: PASS (root tests, gateway test/build, miner-witness test/build, solana lockfile+anchor build)
- main CI: currently running for freshly merged #78/#81; prior baseline and #82 are green

## Recently Resolved
- #82 merged: docs/CI compat behavior clarification
- #78 merged: gateway recursive adapter docs/rebased package
- #81 merged: mass adoption roadmap docs
- #70 closed as superseded by #82/main state

## Open PRs (Current Queue)

| PR | Branch | Title | Areas | Devnet Impact | CI | Status |
|---|---|---|---|---|---|---|
| [#80](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/80) | `codex/pr-premium-auctions` | names: premium auctions for 3-4 char .dns labels | solana,docs | yes | PASS | Deferred (not required for runnable MVP path) |
| [#79](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/79) | `codex/pr-premium-pricing` | names: logarithmic premium pricing + 1-2 char reservation | solana,docs | yes | PASS | Deferred (not required for runnable MVP path) |
| [#69](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/69) | `codex/pr-witness-rewards-devnet-dod` | ddns_witness_rewards: devnet DoD (CLI + proofs) | solana,docs | yes | FAIL | Deferred (not required for runnable MVP path) |
| [#68](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/68) | `codex/quorum-harden-cf-worker` | gateway: harden recursive quorum + add cf worker miner starter | gateway,services,docs | no | FAIL | Deferred (not required for runnable MVP path) |
| [#67](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/67) | `codex/fix-root-npm-test` | fix: root npm test (gateway TS compile) | gateway | no | FAIL | Candidate (overlaps with merged #78; likely close superseded) |
| [#66](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/66) | `copilot/sub-pr-65` | docs: fix gateway README inaccuracies (path, timeout default, npm script) | gateway,docs | no | PASS | Deferred (draft sub-PR on non-main base) |
| [#65](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/65) | `codex/gateway-recursive-cache` | gateway: recursive DoH adapter with TTL cache + stale-if-error | gateway,docs | no | FAIL | Candidate (overlaps with merged #78; likely close superseded) |
| [#64](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/64) | `codex/rep-miner-integration` | miner: integrate REP flow with node relay + cloudflare worker | solana,services,docs | yes | FAIL | Deferred (not required for runnable MVP path) |
| [#63](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/63) | `codex/ddns-rep-program` | solana: ddns_rep (bonded REP rewards with daily caps and diversity gates) | solana | yes | FAIL | Deferred (not required for runnable MVP path) |
| [#61](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/61) | `codex/witness-rewards-permissionless` | solana: ddns_witness_rewards build safety gates | solana,docs | yes | FAIL | Deferred (not required for runnable MVP path) |
| [#51](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/51) | `codex/prX-miner-scoring` | ddns_miner_score: miner scoring + anti-centralization rewards (MVP) | solana,services,docs | yes | FAIL | Deferred (not required for runnable MVP path) |
| [#6](https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/6) | `copilot/move-receipt-format-md-to-specs` | Relocate receipt format spec into /specs | misc | no | PASS | Deferred (not required for runnable MVP path) |

## Merge Policy Applied
Only CI fixes, MVP-run-path unblockers, and onboarding docs were merged in this pass.
