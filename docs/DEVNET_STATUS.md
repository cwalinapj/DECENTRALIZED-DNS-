# Devnet Status Audit

- Generated at (UTC): 2026-02-20T04:51:31.228Z
- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`

## Demo-critical classification

For no-funds MVP prep, the script-level required set is:

- `ddns_anchor`
- `ddns_registry`
- `ddns_quorum`
- `ddns_stake`

All other programs are treated as optional for demo deploy-wave planning.

## Programs from Anchor.toml [programs.devnet]

| Program | Program ID | Executable | Owner | Upgrade Authority | Data Length | Lamports | SOL |
|---|---|---:|---|---|---:|---:|---:|
| ddns_anchor | `DVXF1pMghQnuVeUJuuXJAZGXCDwrhr19nN3hQjvhReMU` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_registry | `D58DJ6VopJKZCJ2cppAJZUcHE1UFF1qruPiU3EP3WMqM` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_quorum | `DqSgwiSrtjjMEHoHNYpLpyp92yjruBTt6u7CYyhzyEbK` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
| ddns_stake | `Ao1vX55CSLTMUoeWEtzfmjWufEUemwm4uL7XGZg1j2AV` | no | `missing` | `unknown` | 0 | 0 | 0.000000000 |
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

- Total SOL locked in program accounts: **0.000000000 SOL** (0 lamports)
- Deploy wallet balance: **5.779590480 SOL** (5779590480 lamports)
- Biggest recent deploy-cost estimate (MVP proxy): **0.000000000 SOL** (0 lamports)
- Recommended reserve rule: `max(5 SOL, 2x biggest_recent_deploy_cost + 1 SOL tx buffer)`
- Recommended reserve: **5.000000000 SOL** (5000000000 lamports)
- Reserve status: **OK**

## Upgrade Buffer Note

- If a program has an upgrade authority, future upgrades require SOL to create/write a new buffer account before finalize. Keep the deploy wallet funded.
