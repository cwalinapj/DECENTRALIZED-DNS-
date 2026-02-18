# REP and Edge Hosting Pathway (MVP -> End State)

> This doc contains: [MVP ✅] [End-State 🔮]

## What REP Is

REP is a non-transferable on-chain reputation score bound to a miner wallet.

REP is a capability primitive, not a spend token:
- TOLL remains utility for toll events.
- REP tracks trust/performance history and later gates edge-host privileges.

## MVP: How REP Is Earned (Anti-Sybil)

REP in MVP is awarded per aggregate submission, not per raw DNS query.

Mandatory anti-sybil gates:
- bond required (`MinerBond` must meet minimum)
- cooldown between awards
- daily cap per miner
- diversity minimums (unique names + unique sources/colos)
- duplicate aggregate root rejection

MVP trust model:
- aggregate correctness is still verified off-chain by miner/verifier workflows
- slashing is centralized/allowlisted in MVP

## REP -> Miner Capabilities (Implemented Primitive)

`MinerCapabilities` is derived from `rep_total` and stored on-chain.

Current threshold model:
- Tier 0: `rep < 1,000` -> not eligible
- Tier 1: `rep >= 1,000` -> `eligible_gateway = true`
- Tier 2: `rep >= 10,000` -> `eligible_edge_host = true`
- Tier 3: `rep >= 50,000` -> higher future capacity limits

MVP note: this enables eligibility state now, but does not yet run CDN traffic scheduling on-chain.

## Why This Is Better Than Free TOLL Mining

Free utility-token emissions are easy to farm with cheap infra (e.g., worker swarms).

REP avoids this by:
- requiring bonded participation
- rewarding diversity + consistency over spam volume
- capping daily accrual

This preserves TOLL economics for real utility spend.

## End State: REP-Gated CDN/Edge Hosting

REP evolves into admission control for distributed edge operators:
- edge cache / relay eligibility
- routing preference weight
- hosting fee participation

Planned upgrades:
- evidence-based slashing and dispute games
- performance proofs (latency/uptime) tied to REP adjustments
- reduced centralization of slash authority

Narrative:
- early miners build REP first
- REP unlocks higher-trust edge roles later
- everyday users get better performance without managing complex mining flow
