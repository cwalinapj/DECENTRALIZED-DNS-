# MVP (What Works / What Is Centralized)

This doc contains: **MVP ✅** and references to **End-State 🔮** (not implemented).

## MVP Trust Assumptions (Explicit)

- **Allowlisted roles exist** in early MVP:
  - allowlisted miners/verifiers (for participation)
  - allowlisted submitters (for posting aggregates / scores / snapshots)
- **Receipt verification is off-chain** in MVP (miners do heavy verification work).

## Miner Scoring + Anti-Centralization (MVP)

On-chain: `ddns_miner_score`

- Miners are scored per epoch on:
  - correctness (penalties if slashed/disputed)
  - diversity (unique names)
  - timeliness (early submissions)
  - uptime (watcher-provided)
- Rewards are paid from a `TOLL` vault.
- Anti-centralization levers in MVP:
  - per-miner epoch reward cap (on-chain)
  - dominance penalty (on-chain)
  - quadratic reward curve committed by allowlisted submitters (off-chain -> on-chain payout)

See: `MINER_SCORING.md`

