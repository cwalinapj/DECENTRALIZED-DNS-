# Devnet Status Audit

- Generated at (UTC): 2026-02-19T03:01:54.590Z
- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`

## Programs from Anchor.toml [programs.devnet]

| Program | Program ID | Executable | Owner | Upgrade Authority | Data Length | Lamports | SOL |
|---|---|---:|---|---|---:|---:|---:|
| ddns_anchor | `9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_registry | `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_quorum | `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_stake | `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_watchdog_policy | `6iveVkjqRiVpbSM3GmktMhGvqN7WConK5NrM6tvRZnnc` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_stake_gov | `86XQF9V51Z8L8MLUP7yMU6ZWPzfaK1nhFsr3Hd8mYFgt` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_escrow | `4jtDN5gqUqpmu1nBfLwPBAz8jBYjP6Nba4yZ8Am75M2J` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_domain_rewards | `7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_ns_incentives | `8mC8Kvky9Jir4Lxe5R5L6ppoexaYtDJKe8JP8xA9JUuM` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_rewards | `8GQJrUpNhCFodqKdhEvWub6pjTtgoXBtBZUqxeEDujAY` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_operators | `3Q5VCoAT4TZ9xMrpbt4jbN9LhHfihxGH3TiD6PmSqHhp` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_miner_score | `37yrHgDgALGe4fUwWhJigQfD95jPFd9g2fDuYHkPAYaS` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_names | `BJgHrrTukutZPWxMDNdd6SXe2A7UzX56Qru6uKfVeHjK` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_cache_head | `J3LCbeg9ocpGcGWdAAFjM8N4G7FTU9na1Lhe5VHBivZt` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_rep | `FAPdRsatJoucFL6h1XQAQnQYN9KRxp7m2vzLLwnNmuLb` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_witness_rewards | `AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |

## Funding / Reserve Summary

- Total SOL locked in program accounts: **0.007990080 SOL** (7990080 lamports)
- Deploy wallet balance: **11.945643640 SOL** (11945643640 lamports)
- Biggest recent deploy-cost estimate (MVP proxy): **0.001141440 SOL** (1141440 lamports)
- Recommended reserve rule: `max(5 SOL, 2x biggest_recent_deploy_cost + 1 SOL tx buffer)`
- Recommended reserve: **5.000000000 SOL** (5000000000 lamports)
- Reserve status: **OK**

## Upgrade Buffer Note

- If a program has an upgrade authority, future upgrades require SOL to create/write a new buffer account before finalize. Keep the deploy wallet funded.
