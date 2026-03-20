# PROOF

- last_success_utc: 2026-03-20T11:20:23Z
- canonical_command: `npm run mvp:demo:devnet`
- wallet_pubkey: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- rpc: `https://api.devnet.solana.com`

## Latest Demo Summary

- name: `u-b5wjx4pd.dns`
- dest: `https://example.com?i=3`
- wallet_mode: `authority`
- interactions: `3`
- confidence: `unknown`
- rrset_hash: `unknown`
- tx_history_path: `/var/folders/h5/7f2x98695lz6819tc0k6fbv80000gn/T//ddns-devnet-demo/tx_history.json`
- wallet_lifecycle_path: `/var/folders/h5/7f2x98695lz6819tc0k6fbv80000gn/T//ddns-devnet-demo/wallet_lifecycle.json`

## Latest Tx Links

- https://explorer.solana.com/tx/3gfu84H7bZa4NXHzHqeXimhab4sNcqzfQRA2mhnd746eTufWSGXSUKG6oxHikQjsX7xV5KYYTbW2wSDBtiByTTpj?cluster=devnet
- https://explorer.solana.com/tx/4XJkC6EyfumAba9LLhM7UoD5Q49FJ43UqtH4CsFNS8Vh6FFYHcPnpAsmMFE8YXBPTHFnXhnW3pGLEXSHDyANwuL9?cluster=devnet
- https://explorer.solana.com/tx/5hG6oH4WE4iLCFh2FDSh4KEggsQTpMbUNBvZVN8yDRDJan7xTzCeKj3PiwivvZV8Sf1v12gLiTGzFzouWdxE6JUG?cluster=devnet

## Devnet Program IDs (from solana/Anchor.toml)

- `ddns_anchor`: `HM1AZFHisxDartjDJj5pTviqyUjDno9zfUHasE8c1TXu`
- `ddns_cache_head`: `APczyvaMLpZaxh3hTRw5xKTkzwKcxEScxKn7zReR7QKg`
- `ddns_domain_rewards`: `Gev4S1xdAUJqvyB65pvN46hXkiptWNa3CUx3hzJDhn2i`
- `ddns_escrow`: `5LLXEJJmBgaCgyFUYVYjnCivgdV4ZcrGWmWNExmArM7`
- `ddns_miner_score`: `AoeU8hXHDZe4Kd1tUB8hTu4FYp49QYBnCjWtLhiqTatE`
- `ddns_names`: `4V5WcPvxJTkRQv2ps8ueBkqPiNcy8HUMz4FS9i4hePA8`
- `ddns_ns_incentives`: `FRoAXq829PMjtANWdnT16iKb7Unhq9NaViX3Mv9JNoeC`
- `ddns_operators`: `Dg8GH1TpVak87wdysAG1UhKCW3w5osMg87KZsSSMVzP5`
- `ddns_quorum`: `7ru9XCvrBDys1te7MK6WLmMjNnQvhC5GZf2jPqAffucL`
- `ddns_registry`: `GDVsLPGxcZLqxj45UujJfEWpXiMwJid8B5a428VZ12QL`
- `ddns_rent_bond`: `BUEaJaRhXkcgnxNtSNRA7p1hbmtQgKwHHHngxKfjRHM3`
- `ddns_rep`: `9J4EysJnFrZ92yTG8MystX9Kwn9eibqPtP6kd8b5mQw5`
- `ddns_rewards`: `DFezrM8E82VpAHo6eCzbfA6QEnmtZhyCYbmpTo5Bm2ak`
- `ddns_stake`: `3KMAq6EKGhskXF3DjjtSdkRUiKnhanb3MYsGWWjCM6Vc`
- `ddns_stake_gov`: `BWtb9bxWZ7i8DPb1eHBEj6MjJa2Mfzo6BwQ1gZc9UUFE`
- `ddns_watchdog_policy`: `Bf3Who54hZMHxubT3YgPZRHNitdQLqKA8HR9Hzbmog3e`
- `ddns_witness_rewards`: `D9nypp5jpJqVj8HaM2NYodYwARd2aydgZcbkbewytbJz`

## Success Criteria

- [x] `✅ demo complete` marker observed
- [x] `✅ STRICT DEMO COMPLETE (ON-CHAIN)` marker observed
- [x] strict mode used (`ALLOW_LOCAL_FALLBACK=0`)
- [x] deploy-wave + inventory + demo executed
