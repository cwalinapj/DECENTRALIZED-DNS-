# MultiGov Config (Base Hub)

## EVM Hub (Base)
Environment values to track when deploying:
- `GOV_TOKEN_NAME`
- `GOV_TOKEN_SYMBOL`
- `GOV_TOKEN_OWNER`
- `TIMELOCK_MIN_DELAY_SEC`
- `GOV_VOTING_DELAY_SEC`
- `GOV_VOTING_PERIOD_SEC`
- `GOV_PROPOSAL_THRESHOLD`
- `GOV_QUORUM_PERCENT`

## Solana Spoke
- Token lock min duration: 30 days
- Toll Pass NFT required for voting

## Rollout Checklist
1. Deploy `DDNSVotesToken`
2. Deploy `DDNSTimelock`
3. Deploy `DDNSGovernor` (wire token + timelock)
4. Configure timelock proposers/executors
5. Register Base hub in MultiGov
6. Add Solana spoke
7. Add Arbitrum spoke later
