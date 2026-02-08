# Governance (Passport + Reputation + Timelock)

This document defines the governance policy model and timelock assumptions.

## Requirements
- Passport NFT required to vote.
- Reputation weighting applies to vote power.
- Timelock enforced on queued actions.

## Config
File: `policy/governance.json`

## Coordinator endpoints
- `GET /governance/config`
- `POST /governance/queue` (admin token required)

This is a **scaffold** and will be expanded with on-chain integration.
