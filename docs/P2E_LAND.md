# P2E Land (Minimal Loop)

## Core Loop
1. Player mints a Land NFT (one plot).
2. Land generates Ore at a fixed rate (1 Ore/hour at level 1).
3. Player calls `claim()` to mint Ore (soulbound).
4. Player spends Ore to upgrade land (level 1 → 2 → 3).

## Rules
- Ore is **soulbound** (non-transferable).
- Native token is required for land purchases and upgrades (through Ore redemption).
- Ore can be redeemed at **500 Ore → 1 native token**.
- Upgrade costs are fixed per level (simple curve).

## Contracts (Base)
- `LandGame` (core logic)
- `LandPlot` (ERC721)
- `OreToken` (soulbound ERC20)

## Tokenomics
- Sinks: land price, upgrades, Ore redemption.
- Sources: time-based Ore emissions.
- Goal: net positive by tuning `landPrice`, `baseRatePerSecond`, and `upgradeCosts`.
