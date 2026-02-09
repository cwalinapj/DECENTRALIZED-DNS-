# Miner Scoring (MVP) and Anti-Centralization Incentives

This doc contains: **MVP ✅** and **End-State 🔮**.

## What This Solves

We want miner/verifier incentives that:

- reward correct, available, responsive operators
- discourage a single miner from dominating submissions and rewards
- remain MVP-feasible (receipt verification off-chain; on-chain checks lightweight)

On-chain program: `ddns_miner_score` (Solana / Anchor)

## MVP Summary (Trust Model)

**MVP ✅**
- Receipts and aggregate correctness are verified **off-chain** by miners/watchers.
- On-chain accepts per-epoch miner stats + reward assignments from **allowlisted submitters**.
- Rewards are paid in `TOLL` from an on-chain vault to miner token accounts.

**End-State 🔮**
- Remove allowlists by requiring:
  - stake-weight proofs against `ddns_stake_gov` stake snapshot roots
  - receipt/aggregate Merkle proofs (or ZK) and challenge windows
  - slashing for provably incorrect submissions

## On-Chain Objects (ddns_miner_score)

### MinerScoreConfig (PDA)
Seed: `["miner_score_config"]`

Stores:
- `toll_mint`, `reward_vault`
- `epoch_len_slots`
- reward pool params: `base_reward_per_epoch`, `per_miner_epoch_cap`
- eligibility: `min_miner_stake_weight`
- allowlists (MVP): `allowlisted_submitters`, `allowlisted_miners`
- scoring weights (bps) and thresholds

### MinerEpochStats (PDA per miner per epoch)
Seed: `["miner_epoch", epoch_id_le, miner_pubkey]`

Stores:
- reported stats (stake weight, aggregates submitted, unique names/receipts, first/last submit slot)
- scores (correctness/uptime + derived timeliness/diversity components)
- `raw_score` (computed on-chain)
- `normalized_score` and `reward_amount` (assigned off-chain in MVP)
- claim state and submitter identity

### EpochTotals (PDA per epoch)
Seed: `["epoch_totals", epoch_id_le]`

Stores O(1) audit fields:
- total raw/normalized scores (provided by submitter in MVP)
- planned pool, miner count, dominance info
- finalized flag

## Score Components (MVP)

All sub-scores use **0..10000**.

1) Correctness
- `correctness_score` starts at 10000, reduced when disputes/slashing occur.

2) Uptime
- `uptime_score` provided by watcher/miner (MVP: can default 10000).

3) Diversity
- rewards breadth over raw volume:
  - `diversity_component = min(10000, unique_name_count * 10000 / diversity_target)`

4) Timeliness
- earlier submissions score higher within the epoch window:
  - `timeliness_component = remaining_window / epoch_len_slots * 10000`

### On-Chain Raw Score Formula

Weights are bps and must sum to 10,000:

```
component =
  (alpha_correctness_bps * correctness_score
 + alpha_uptime_bps      * uptime_score
 + alpha_diversity_bps   * diversity_component
 + alpha_timeliness_bps  * timeliness_component) / 10_000

raw_score = stake_weight * component
```

Centralization penalty:
- if `dominance_share_bps > dominance_threshold_bps` then apply a penalty multiplier:
  - `raw_score = raw_score * (10000 - centralization_penalty_bps) / 10000`

## Anti-Centralization Levers (MVP)

1) **Quadratic reward curve (off-chain, committed on-chain)**
- allocate the epoch pool using diminishing returns:
  - reward ∝ `sqrt(score)`

2) **Per-miner cap**
- on-chain enforces `reward_amount <= per_miner_epoch_cap`

3) **Diversity bonus**
- on-chain favors unique names served, not raw volume

4) **Stake gating**
- `min_miner_stake_weight` prevents zero-stake spam participation

5) **Penalty + cool-down**
- `penalize_miner` reduces reward if not yet claimed
- end-state: connect penalties to provable disputes + slashing

## End-State Roadmap (Trust-Minimized)

- Replace allowlisted submitters with:
  - multi-party submissions (K-of-N watchers)
  - stake-weighted committees
  - dispute windows and slashing for incorrect reports
- Tie correctness to:
  - on-chain commitments of receipt Merkle roots
  - challenge games (anyone can prove a report invalid)

