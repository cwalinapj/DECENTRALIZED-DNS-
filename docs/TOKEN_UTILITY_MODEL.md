# Token Utility Model (MVP -> Production)

This document sharpens utility beyond faucet + passive staking and sets measurable product behavior.

## Scope

- Token: `DACIT` (governance + work utility)
- Current MVP: faucet access and staking panel
- Target: recurring operational utility tied to verified network work

## Utility lanes

1. Route-write credits
- Users spend DACIT credits to create/update premium `.dns` routes.
- Credits are metered by route-write operations and TTL profile.
- Goal: predictable usage billing instead of one-off faucet usage.

2. Resolver QoS tiers
- Staked DACIT unlocks resolver QoS bands:
- Higher cache priority, higher request budget, lower cold-start latency targets.
- Goal: tie token utility directly to user-facing reliability.

3. Witness/attestor rewards
- Verified route and witness activity earns DACIT.
- Reward weight factors:
- successful proofs, uptime participation windows, and anti-sybil throttles.

4. Operator bond + slashing signals
- Operators post DACIT bonds for service commitments.
- Repeated policy violations create slash eligibility events (governance controlled).
- Goal: align token with reliability enforcement.

5. Governance actions with operational impact
- DACIT governance should prioritize knobs that impact production economics:
- reward curves, QoS multipliers, bond floor, emergency controls.

## Production metrics

- `daily_active_wallets`
- `route_writes_per_wallet_7d`
- `qos_tier_distribution`
- `witness_reward_claims_7d`
- `bonded_operator_count`

## MVP delivery sequence

1. Add usage metering for repeated wallet interactions in devnet demos.
2. Add route-credit accounting and read APIs.
3. Add QoS tiering policy hooks in gateway/tollbooth.
4. Add witness reward accounting surfaced in dashboard/API.
5. Add governance parameter change logs + safety windows.

## Non-goals (current MVP)

- No promise of final mainnet emissions schedule.
- No permissionless slashing automation without audit-ready invariants.
- No uncapped faucet dependency in production paths.
