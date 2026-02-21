# Web2 Pricing Model (USD-first, Web3 rails hidden)

## Default user model

- Users pay a fixed USD price.
- Users do not need crypto to use TollDNS.
- DNS, gateway, hosting, and continuity policy are presented as a standard web product flow.
- Pay in USD is the default experience; crypto is optional and handled behind the scenes.

## Two-lane framing

### Lane A: User story (default)
- Pay in USD.
- Get DNS + gateway + static hosting defaults.
- Get renewal continuity protections (policy-gated).
- Optionally use AI guardrails and developer API/SDK.

### Lane B: Operator / Treasury (advanced)
- Program deployment and rent funding.
- Treasury reserves and runway management.
- Validator strategy (optional).
- Rewards and miner economics.

## Important rent statement

- Rent-exempt lamports are required deposits for Solana accounts/programs.
- Staking does **not** remove rent-exempt requirements.
- Staking is an optional treasury strategy for excess reserves and ongoing ops costs.

## Billing ownership

- User-facing billing remains USD-stable.
- Treasury handles SOL/TOLL/USDC rails, reserve management, and operational funding in the background.

## Renewal protection (user-facing)

- If renewal payment is at risk, continuity warning/banner flows activate first.
- Eligible domains can remain reachable in safe degraded mode during recovery windows.
- Final handling remains bounded by registrar/registry policy windows; this is protection against accidental loss, not an infinite hold promise.

## Subsidy economics (concept + roadmap)

- Users earn pricing benefits by keeping nameservers with TollDNS and participating in policy-approved network usage.
- Treasury-side toll economics can subsidize renewal and hosting costs over time.
- MVP status: policy framing and accounting interfaces are in place; full registrar subsidy automation is roadmap work.
