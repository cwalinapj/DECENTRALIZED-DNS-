# Devnet Status Audit

- Generated at (UTC): 2026-02-19T13:20:00Z
- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`
- Canonical IDs: `solana/target/deploy/*-keypair.json` pubkeys (synced into `solana/Anchor.toml` and all `declare_id!`).

## Programs from Anchor.toml [programs.devnet]

| Program | Program ID | Status | Upgrade Authority | ProgramData |
|---|---|---|---|---|
| ddns_anchor | `EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `B8JBWF6LrmsVp6yFsvML4EEcuMoRNwHxrni5nGw37PA4` |
| ddns_registry | `5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `4qyzPe9GkLhq5HnDkDYmzKdhKhBmYEzKvv57tJ6VZSjR` |
| ddns_quorum | `2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `7zpQFZV6M72vAfvgi41xbjmpvmoqG2Yg6GTLfjF8YMj8` |
| ddns_stake | `FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `4kUVnSUAh4kMDLw7AgvCr43ptag1WD6B4Dxa2UEEGJbH` |
| ddns_watchdog_policy | `Ct4gQ98PofJxca2HSQrfzd1Cohay4praM9dFF2L9jr1g` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `9Gw4YeKFTL1RHM25njPRM2rVY8XjwpSs6VERZye2SUm9` |
| ddns_stake_gov | `EeU6h3gUUVKJeBsGG77onyH9Sjbq87Uz976RYHt2pCPf` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `Fcn1t45zKiWBSJ8nvU4spAoi34Q5Hytm9iFU77Mes2MC` |
| ddns_escrow | `2it8BbaePYnGaKcBrT5fAk7uj2YWaGdKtqSPriervwtA` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `FQCT9hH8dGtibbdYSuTJ4rXvHKLPBmZPoWBzTBEoz9Fd` |
| ddns_domain_rewards | `CKuPPeJAM8GdfvVMvERxa7rXJcNYwEy2P7wevQ4tjja2` | NOT_FOUND | - | - |
| ddns_ns_incentives | `J3rL2iuBB3LzvymJ92yRQbRV6biLFefBKh5UvHLBwEJ2` | DEPLOYED | `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` | `4JkaTeMqwJnUXZs4gPBNcDHKLMGokrGfNGZTtCjofxgc` |
| ddns_rewards | `D2P9nj4aVS9GiWu4UoLeBtJxKwVfu7FXqnj76f1sKwBd` | NOT_FOUND | - | - |
| ddns_operators | `6QpkisF6re7KM5XwiYv5mqRmsfPBAwFEK6tkRmMeSRL8` | NOT_FOUND | - | - |
| ddns_miner_score | `GYexwqwG1WArm3uSRNpTxZPVwvAPqrJp7BVzECJmWJGH` | NOT_FOUND | - | - |
| ddns_names | `BYQ68JftwZD2JEMXLAiZYYGMr6AD9cD9XznntA4v6Mjj` | NOT_FOUND | - | - |
| ddns_cache_head | `HjCiKFJKnSvuUd8gN8NjiFPdiwRZSqDit7LMJzFt3Sck` | NOT_FOUND | - | - |
| ddns_rep | `BS62AYwh5KuhTWoVHiDbpAhifK4SDC1FJtKaYw9bSKaE` | NOT_FOUND | - | - |
| ddns_witness_rewards | `6dNEBRscCHZB7yHo1iPBktccUSN7P32eSvY1FQkPh7hd` | NOT_FOUND | - | - |

## Funding / Deploy Blocker

- Wallet balance at verification time: **0.79716988 SOL**
- Devnet faucet retries (`solana airdrop 1`) failed with rate-limit errors.
- Remaining programs require additional SOL to deploy from canonical keypairs.

## Next Step

Top up deploy wallet `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5` to **>= 8 SOL**, then run:

```bash
cd solana
for p in ddns_domain_rewards ddns_rewards ddns_operators ddns_miner_score ddns_names ddns_cache_head ddns_rep ddns_witness_rewards; do
  anchor deploy --provider.cluster devnet --program-name "$p"
done
```
