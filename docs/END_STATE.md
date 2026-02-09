# End-State (Miner-First Decentralization)

This doc contains: **End-State 🔮** (design targets), not fully implemented.

## Goals

- remove centralized choke points (no single miner/gateway/watcher can censor)
- make incentives auditable and difficult to game
- keep everyday-user UX simple while miners run the heavy stack

## Miner Scoring End-State (Trust-Minimized)

Target: replace MVP allowlists with verifiable proofs + dispute resolution.

1) Proof-backed stake weights
- miners prove stake weight via Merkle proofs against `ddns_stake_gov` stake snapshot roots

2) Proof-backed correctness
- miners commit receipt/aggregate roots on-chain
- anyone can challenge incorrect reports within a dispute window

3) Slashing
- provably incorrect submissions lead to slashing/jailing
- repeated offenders lose eligibility

4) Anti-centralization
- quadratic reward curves and per-epoch caps remain
- diversity bonuses are enforced (more unique names > raw volume)
- committee rotation + stake-weighted selection reduces dominance

See: `MINER_SCORING.md`

