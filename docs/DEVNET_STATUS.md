# Devnet Status Audit

- Generated at (UTC): 2026-02-20T20:29:53.541Z
- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`

## Programs from Anchor.toml [programs.devnet]

| Program | Program ID | Executable | Owner | Upgrade Authority | Data Length | Lamports | SOL |
|---|---|---:|---|---|---:|---:|---:|
| ddns_anchor | `EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_registry | `5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_quorum | `2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_stake | `FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86` | yes | `BPFLoaderUpgradeab1e11111111111111111111111` | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | 36 | 1141440 | 0.001141440 |
| ddns_watchdog_policy | `GTJWP2Mxu8DqVLMY8PAuAC3EwQKnviKAg4JY4mwMqVnF` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_stake_gov | `HrSpSTG1dg3vqszY4P3idJpw9zrSUJ63ATS1eDxyxjh4` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_escrow | `EoAdi1RNEYXurdHGUbCnHKGc2DgvKyJqrLVMkXPNj7MR` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_domain_rewards | `BTsZBPqu92LWeqtPHDoMDuDAhd3mHmiers3pwrH2r2Pe` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_ns_incentives | `AsnMwghaaKanvcYSffPr9MgwfXJoYini3BzVjaPPVMoL` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_rewards | `5jcbSwHWNzuSMY7iJJTeVaQtaT14gpu9x3RPeQ8ZhxJX` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_operators | `4onCDt3BR47VbJDkHeiFPXg6H6HJtGLzMQXJ58ovrx5d` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_miner_score | `CktwdmQXGar4qJKKPxFsPdKQ9RMM5joJhqxKtZC2KAf8` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_names | `AkABCWonPtbj8vpxef5GGBMdtWbLTo4p4ZnLR8rjYigB` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_cache_head | `943epY8PMFRQkzJGaqjS8wLexHnQxS2o1cNm4xU1UDGb` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_rep | `F2Jdqby47WQaqD7hYWdx2Hsg7yQCVUB7wCMyYGRhZ2EY` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_witness_rewards | `CxoBkEjwHDJWUX9DyURPNyu9hrv92TaUK2yTS9tFAPdC` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |

## Funding / Reserve Summary

- Total SOL locked in program accounts: **0.004565760 SOL** (4565760 lamports)
- Deploy wallet balance: **15.746172680 SOL** (15746172680 lamports)
- Biggest recent deploy-cost estimate (MVP proxy): **0.001141440 SOL** (1141440 lamports)
- Recommended reserve rule: `max(5 SOL, 2x biggest_recent_deploy_cost + 1 SOL tx buffer)`
- Recommended reserve: **5.000000000 SOL** (5000000000 lamports)
- Reserve status: **OK**

## Upgrade Buffer Note

- If a program has an upgrade authority, future upgrades require SOL to create/write a new buffer account before finalize. Keep the deploy wallet funded.
