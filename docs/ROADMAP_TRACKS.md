# Roadmap Tracks: Staking MVP vs Decentralized Optimization Network

This split avoids roadmap ambiguity and keeps production sequencing explicit.

## Track A: Staking MVP (near term)

Goal: ship reliable staking and route lifecycle flows with strict on-chain proof.

Core outcomes:
- Strict devnet demo with explorer-linked tx history.
- Wallet lifecycle modes (authority, persistent client, ephemeral client).
- Repeated wallet interaction instrumentation.
- Stable staking panel behavior tied to deployed program IDs.

Exit criteria:
- Repeat demo runs pass with deterministic proof artifacts.
- Usage metrics show repeated interactions from non-empty wallet cohorts.
- CI gates for release integrity + invariants are green.

## Track B: Decentralized Optimization Network (long range)

Goal: distributed optimization, witness markets, and policy-based economic coordination.

Core outcomes:
- Decentralized witness reward markets.
- Operator economics with bond/penalty governance.
- Multi-role optimization loops (resolver, cache, witness, operator).
- Policy automation with auditable safety controls.

Exit criteria:
- Audit-ready invariants and threat coverage for economic-critical programs.
- Operational reliability SLOs validated under sustained load.
- Governance process and emergency controls exercised.

## Dependency order

1. Track A production hardening gates.
2. External audit + invariant expansion.
3. Track B economic and policy rollout phases.

Track B should not be treated as implied by a completed Track A staking MVP.
