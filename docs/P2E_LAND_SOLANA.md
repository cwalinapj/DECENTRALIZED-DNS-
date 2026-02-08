# P2E Land (Solana Spec)

## Core Loop
1. Player mints a Land NFT (one plot).
2. Land generates Ore at a fixed rate (e.g., 1 Ore/hour at level 1).
3. Player calls `claim()` to mint Ore (soulbound).
4. Player spends Ore to upgrade land (level 1 → 2 → 3).

## Rules
- Ore is **soulbound** (non-transferable).
- Native token is required for land purchases and upgrades (through Ore redemption).
- Ore redemption: **500 Ore → 1 native token**.
- Upgrade costs are fixed per level (simple curve).

## Accounts (Solana)
- `LandPlot` NFT mint per plot.
- `LandState` PDA per plot (level, last_claim).
- `OreMint` (soulbound SPL; enforced at program level).
- `Treasury` for native token.

## Net-Positive Design
- Sinks: land price, upgrades, Ore redemption.
- Sources: time-based Ore emissions.
- Tune rate and cost curves to keep net positive.
