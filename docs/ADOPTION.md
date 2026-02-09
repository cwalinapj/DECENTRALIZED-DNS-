# Adoption: Incentives + Minimal User Friction (MVP vs End State)

**This doc contains:** [MVP ✅] [End State 🔮]

**MVP**: centralized pieces still exist (gateway availability, allowlisted miners).  
**End State**: fully decentralized quorum + stake-weighted witnesses + optional IPFS receipt batches.

## 1) Who Benefits

Domain owners:
- earn TOLL from toll revenue by delegating NS/DoH to the network and registering a payout wallet
- get an “install once, earn continuously” incentive for adoption

Miners / verifiers:
- earn from verification + aggregation work (and later, stake rewards)
- provide the strongest decentralization path first (heavy infra, proofs, reconciliation)

Everyday users:
- fast, censorship-resistant resolution from local cache
- minimal friction: pay toll only on toll events (cache miss / acquisition / refresh)

## 2) Adoption Steps (MVP)

Domain owner:
1. Point NS and/or DoH traffic to the network gateway endpoints (bootstrap infrastructure).
2. Register a payout wallet on-chain for `name_hash` and configure the reward split.

User:
1. Install a wallet/plugin (MVP can be CLI/scripts; extension later).
2. Resolve `.dns` names cache-first.
3. Pay a toll only when acquiring/updating a route (toll event).

## 3) Economics (MVP)

Payment surface:
- toll events only (cache miss / acquisition / refresh)
- not per raw DNS query

Reward split (bps; sum must be `10,000`):
- `owner_bps`: domain owner payout
- `miners_bps`: miners/verifiers
- `treasury_bps`: protocol treasury

Why per-query isn’t used in MVP:
- per-query is cheap to fake with bots
- toll events are scarce and map to real demand and cost (route acquisition / refresh)

## 4) Trust Model (MVP vs End State)

MVP trust assumptions (explicit):
- gateway/tollbooth services may be centralized and can be censored or down
- miners/verifiers can be allowlisted
- receipt verification can be off-chain (miners)

What makes it still censorship-resistant:
- clients can retain cached routes and verify canonical state on refresh
- canonical changes require quorum; a single gateway cannot silently rewrite truth
- witness receipts contain no client identifiers; auditing does not require tracking users

End state direction:
- stake-weighted quorum and rotating committees
- slashing for provably fraudulent aggregates
- optional public witness batch commitments (IPFS + on-chain pointers + challenge windows)
