# Audit Report

## Baseline Main CI Status
- Recent runs sampled: 20
- Success: 2
- Failure/cancelled/timed_out: 18

## Open PR Summary

| PR | Branch | Goal summary | Risk | CI status | Failing workflows | Logs |
|---|---|---|---|---|---|---|
| #71 | codex/pr-ddns-names-premium-gate | feat: .dns identity + premium gate for sellable miner rewards (MVP) | med | all-success | none | (none) |
| #70 | codex/pr-ci-compat-fix | ci: skip compat validation when harness inputs missing (MVP) | low | failing-or-pending | ci | docs/audit/ci/logs/pr_70_run_22154778313_failed.log |
| #69 | codex/pr-witness-rewards-devnet-dod | ddns_witness_rewards: devnet DoD (CLI + proofs) | med | failing-or-pending | ci | docs/audit/ci/logs/pr_69_run_22155066142_failed.log |
| #68 | codex/quorum-harden-cf-worker | gateway: harden recursive quorum + add cf worker miner starter | med | failing-or-pending | ci | docs/audit/ci/logs/pr_68_run_22136233465_failed.log |
| #67 | codex/fix-root-npm-test | fix: root npm test (gateway TS compile) | med | failing-or-pending | ci | docs/audit/ci/logs/pr_67_run_22135733780_failed.log |
| #66 | copilot/sub-pr-65 | docs: fix gateway README inaccuracies (path, timeout default, npm script) | med | all-success | none | (none) |
| #65 | codex/gateway-recursive-cache | gateway: recursive DoH adapter with TTL cache + stale-if-error | med | failing-or-pending | ci | docs/audit/ci/logs/pr_65_run_22134277208_failed.log |
| #64 | codex/rep-miner-integration | miner: integrate REP flow with node relay + cloudflare worker | med | failing-or-pending | ci | docs/audit/ci/logs/pr_64_run_22134205795_failed.log |
| #63 | codex/ddns-rep-program | solana: ddns_rep (bonded REP rewards with daily caps and diversity gates) | med | failing-or-pending | ci | docs/audit/ci/logs/pr_63_run_22133611135_failed.log |
| #62 | codex/rep-tokenomics-docs | docs: MVP tokenomics split (TOLL utility + REP miner rewards) | low | failing-or-pending | ci | docs/audit/ci/logs/pr_62_run_22133472335_failed.log |
| #61 | codex/witness-rewards-permissionless | solana: ddns_witness_rewards build safety gates | med | failing-or-pending | ci | docs/audit/ci/logs/pr_61_run_22136387963_failed.log |
| #59 | codex/merge-guardrails-policy | ops: strict merge guardrails + one-at-a-time PR workflow | low | failing-or-pending | ci | docs/audit/ci/logs/pr_59_run_22132518799_failed.log |
| #51 | codex/prX-miner-scoring | ddns_miner_score: miner scoring + anti-centralization rewards (MVP) | high | failing-or-pending | ci | docs/audit/ci/logs/pr_51_run_21822448028_failed.log |
| #6 | copilot/move-receipt-format-md-to-specs | Relocate receipt format spec into /specs | low | all-success | none | (none) |

## codex/* Branches Without Open PR

| branch | last sha | inferred purpose | touched areas |
|---|---|---|---|
| codex/adapter-layer | 0b68c1b | gateway: rename adapter endpoint and document quick verify | none |
| codex/mvp-tollbooth-devnet | eb39fcc | MVP tollbooth + devnet passport mint and per-wallet routes | none |
| codex/pr-design3-onchain-only | c99ee0a | solana: add PR2 verification notes | none |
| codex/pr-docs-start-here | 32a5298 | docs: start-here UX + status + PR template | none |
| codex/pr-domain-rewards-witness | 6b2c310 | solana: prune Cargo.lock after removing unused programs | none |
| codex/pr-miner-client-only | 50b1028 | PR3: stabilize receipt schema + add devnet quickstart docs | none |
| codex/pr-ns-incentives-usage-based | 13e7433 | Docs: make anchor test default to localnet | docs,services,other,solana |
| codex/pr-witness-domain-split | 485880c | VERIFIED: devnet deploy ddns_rewards | docs,services,other,solana |
| codex/pr0-onboarding | c319cf1 | docs: start-here onboarding + status + PR template | none |
| codex/pr1b-adoption-wedge-docs | 0e23cd8 | README: Start Here (MVP) + devnet program list | none |
| codex/pr2-design3-onchain | 0dcb541 | solana: add PR2 verification notes | none |
| codex/pr3-cli-miner-witness | 684191f | pr3: start branch with deliverables checklist | none |
| codex/pr3-design3-miner-client | 4f1cfa2 | PR3: stabilize receipt schema + add devnet quickstart docs | none |
| codex/prA-threat-model-docs | 648db25 | Add threat model + attack-mode degradation docs | none |
| codex/prB-attack-mode-module | 0ca6f51 | Add shared attack-mode policy module with multi-RPC helper | none |
| codex/prC-miner-witness-attack-mode | 8232811 | Add miner-witness service with attack-mode enforcement | none |
| codex/prD-gateway-tollbooth-attack-mode | d74dfe0 | Add attack-mode policy integration to gateway and toll-booth | none |
| codex/prE-client-scripts-attack-mode | 5165b8e | Add attack-mode multi-RPC write guard to Solana client scripts | none |
| codex/prX-adapters | 62349cd | pkdns: add resolve+verify via witness and explicit verification semantics | none |
| codex/prX-watchdog-policy | d694657 | Add watchdog attestations + on-chain policy state (MVP) | none |

## Top Blockers

### Failing workflows (open PRs)
- ci: 11 failing run(s)

### Common failure strings (from harvested failed logs)
- 11	No such file or directory
- 10	 path "/home/runner/work/DECENTRALIZED-DNS-/DECENTRALIZED-DNS-/workers/compat-runner" not found
