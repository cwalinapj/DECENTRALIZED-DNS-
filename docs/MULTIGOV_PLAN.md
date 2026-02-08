# MultiGov Plan (Base Hub + Solana Spoke)

## Overview
- **Hub**: Base (EVM)
- **Spoke**: Solana
- **Later**: Arbitrum spoke

## Hub (Base)
Contracts:
- `DDNSVotesToken` (ERC20Votes + CLOCK_MODE timestamps)
- `DDNSGovernor`
- `DDNSTimelock`

Flow:
1. Deploy token.
2. Deploy timelock.
3. Deploy governor referencing token + timelock.
4. Configure governor as proposer/executor on timelock.

## Spoke (Solana)
- 30-day lock PDA + SPL escrow vault (token transfer enforced).
- Voting eligibility = lock > 30 days + Toll Pass NFT.

## Voter Requirements
- Must hold Toll Pass NFT.
- Must lock token for 30 days (Solana).

## Rollout Steps
1. Launch Base hub governance.
2. Add Solana spoke integration.
3. Add Arbitrum spoke for EVM users later.
