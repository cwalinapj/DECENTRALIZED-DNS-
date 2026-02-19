# Devnet Inventory

- timestamp_utc: 2026-02-19T13:37:04Z
- rpc: https://api.devnet.solana.com
- wallet: B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5
- wallet_balance: 2.03810052 SOL
- demo_name: example.dns
- demo_epoch_id: 0

## Program Inventory (Anchor.toml [programs.devnet])

| Program | Tier | Program ID | Exists | Executable | Owner | Upgrade Authority | ProgramData | Executable Lamports | ProgramData Lamports | Combined Lamports | Combined SOL | Status |
|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|
| ddns_anchor | REQUIRED | `Cfg6rAXyemB4hqzf7DMY2yM5eY1RUqPwwE5jmZeUZM1v` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_registry | REQUIRED | `GBANos76CB8XiW3phuiCuZFsNvAhE9eBH4p8xxtVidPb` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_quorum | REQUIRED | `aaWUWeNPMVDtwokCxXTmDHV9GUvDrf2kBTtGbZxUV7B` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_stake | REQUIRED | `NLhRanr3wJGyHmGVxJ9cvjPef1wrmeZZHARXjrKHknD` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_watchdog_policy | OPTIONAL | `5jRL193F84p4L9GFZmNUneyuZ19zopzsmnGVqZBkxdYH` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_stake_gov | OPTIONAL | `BXZtfMCFu3kR7XtV41Y75EKPH7mQijTXLYQi9L6a1mrD` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_escrow | REQUIRED | `ConB7NytXDkuuANxWzoNMSDqX5wW4W95PpF4c4aizLpi` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_domain_rewards | REQUIRED | `WcHA8hCPxfMB9MCs48k9PtLcmnvQiMe1dEVciP96LoA` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_ns_incentives | OPTIONAL | `F7PcEsu8qR2vmvUv42E84rtu61QAZj4YWgH3sn1QYzwg` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_rewards | REQUIRED | `AN2kAs8RSPb5KzggSPPyoZk3UXSrKjPW6r6N2r5Ap5bm` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_operators | OPTIONAL | `CVMKnGhHeBRU6UKfabGNHkRGJyp7dq7VMmEb9kNfu6G5` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_miner_score | REQUIRED | `4ynffPWNStFxWppizPrrdam91nsPmV3kKD75DjxjNxxP` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_names | OPTIONAL | `8FdWvta8RmCtPqqK4QoszKxf5Pn5kDjk6fvQ1XbEbB9g` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_cache_head | REQUIRED | `DsVuh3GyKTNHAorGnMqcaWPLRH2u84hM153c9uF88s9M` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_rep | OPTIONAL | `CLE3orPrN6Wd4L3p7Z4mga3nSQa8Z1d3Kd1kvnVENB9U` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |
| ddns_witness_rewards | REQUIRED | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | no | no | `-` | `-` | `-` | 0 | 0 | 0 | 0 | missing |

## Key Demo PDAs / Vaults (rent + top-up guidance)

| Label | Program | PDA | Exists | Lamports | Data Len | Rent Exempt Lamports | Recommended Top-up Lamports |
|---|---|---|---|---:|---:|---:|---:|
| ddns_anchor:config | `Cfg6rAXyemB4hqzf7DMY2yM5eY1RUqPwwE5jmZeUZM1v` | `FefeiUgxqj7xixkCYn3tot5ypw6orr2sf2TSt1NkUz8M` | no | 0 | 0 | 0 | 0 |
| ddns_anchor:toll_pass(wallet) | `Cfg6rAXyemB4hqzf7DMY2yM5eY1RUqPwwE5jmZeUZM1v` | `J7vmig6igwV8Z57LbWym2W2rvgNdjQc6nDMPFnNkqiDb` | no | 0 | 0 | 0 | 0 |
| ddns_anchor:name_record(example.dns) | `Cfg6rAXyemB4hqzf7DMY2yM5eY1RUqPwwE5jmZeUZM1v` | `3QbmJ4neQoXwDHFcdVJQZafDYWWHdKhFk5VwsAXkfzDE` | no | 0 | 0 | 0 | 0 |
| ddns_anchor:route_record(wallet,example.dns) | `Cfg6rAXyemB4hqzf7DMY2yM5eY1RUqPwwE5jmZeUZM1v` | `ARp2RrUWWjTgEfu1JtjzJKLyKbjFo4kaptfHiczyDpJC` | no | 0 | 0 | 0 | 0 |
| ddns_witness_rewards:config | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | `5Lv4YZh68ewns3zemD8pAtsqXXD5v4SoGWXijKftqpgu` | no | 0 | 0 | 0 | 0 |
| ddns_witness_rewards:vault_authority | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | `G7zWGN2L9X1Jn9RqWFN1rcgtbDw2WDFYnDDc4L1kmBB2` | no | 0 | 0 | 0 | 0 |
| ddns_witness_rewards:bond(wallet) | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | `8CcuwgwtAPAiVfwueDmWFSfJL49MBqhDNQP8SaRPf8of` | no | 0 | 0 | 0 | 0 |
| ddns_witness_rewards:epoch_state(0) | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | `6asKcrwQ3ch2jZUmT5CdhYBnFRDnQvVw8D8AvhL5pL7J` | no | 0 | 0 | 0 | 0 |
| ddns_witness_rewards:epoch_stats(0,wallet) | `3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V` | `2jsh9x3uwkteAdVu3aTKQRGeRADFGkuUddecaQrHASgd` | no | 0 | 0 | 0 | 0 |

## Summary

- required_total: 10
- required_ok: 0
- required_fail: 10
- optional_missing: 6
- total_program_sol: 0
- recommended_reserve_sol: 5.000000000
- recommended_wallet_topup_sol: 2.961899480

