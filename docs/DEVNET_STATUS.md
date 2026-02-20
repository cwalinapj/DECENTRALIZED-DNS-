# Devnet Status Audit

- Generated at (UTC): 2026-02-20T20:54:44.904Z
- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`

## Programs from Anchor.toml [programs.devnet]

| Program | Program ID | Executable | Owner | Upgrade Authority | Data Length | Lamports | SOL |
|---|---|---:|---|---|---:|---:|---:|
| ddns_anchor | `EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_registry | `5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_quorum | `2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_stake | `FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_watchdog_policy | `Ct4gQ98PofJxca2HSQrfzd1Cohay4praM9dFF2L9jr1g` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_stake_gov | `EeU6h3gUUVKJeBsGG77onyH9Sjbq87Uz976RYHt2pCPf` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_escrow | `2it8BbaePYnGaKcBrT5fAk7uj2YWaGdKtqSPriervwtA` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_domain_rewards | `CKuPPeJAM8GdfvVMvERxa7rXJcNYwEy2P7wevQ4tjja2` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_ns_incentives | `J3rL2iuBB3LzvymJ92yRQbRV6biLFefBKh5UvHLBwEJ2` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_rewards | `D2P9nj4aVS9GiWu4UoLeBtJxKwVfu7FXqnj76f1sKwBd` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_operators | `6QpkisF6re7KM5XwiYv5mqRmsfPBAwFEK6tkRmMeSRL8` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_miner_score | `GYexwqwG1WArm3uSRNpTxZPVwvAPqrJp7BVzECJmWJGH` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_names | `BYQ68JftwZD2JEMXLAiZYYGMr6AD9cD9XznntA4v6Mjj` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_cache_head | `HjCiKFJKnSvuUd8gN8NjiFPdiwRZSqDit7LMJzFt3Sck` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_rep | `BS62AYwh5KuhTWoVHiDbpAhifK4SDC1FJtKaYw9bSKaE` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_witness_rewards | `6dNEBRscCHZB7yHo1iPBktccUSN7P32eSvY1FQkPh7hd` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |

## Funding / Reserve Summary

- Total SOL locked in program accounts: **0.009131520 SOL** (9131520 lamports)
- Deploy wallet balance: **15.735702680 SOL** (15735702680 lamports)
- Biggest recent deploy-cost estimate (MVP proxy): **0.001141440 SOL** (1141440 lamports)
- Recommended reserve rule: `max(5 SOL, 2x biggest_recent_deploy_cost + 1 SOL tx buffer)`
- Recommended reserve: **5.000000000 SOL** (5000000000 lamports)
- Reserve status: **OK**

## Upgrade Buffer Note

- If a program has an upgrade authority, future upgrades require SOL to create/write a new buffer account before finalize. Keep the deploy wallet funded.
