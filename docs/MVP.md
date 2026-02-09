# Design 3 MVP: Cache-as-Witness + Staking (Ship Now)

**This doc contains:** [MVP ✅] [End State 🔮]

**MVP**: centralized pieces still exist (gateway availability, allowlisted miners).  
**End State**: fully decentralized quorum + stake-weighted witnesses + optional IPFS receipt batches.

This MVP ships a working `.dns` flow on Solana devnet while explicitly allowing centralized bootstrap components. The system is structured so clients can verify what matters and later migrate to full decentralization.

## 1) What MVP Delivers

- `.dns` resolution through a gateway/tollbooth (fast path).
- Local cache on the user machine (cache-first).
- Solana programs as source of truth for:
  - Passport/TollPass identity + `.dns` name claim (anti-sybil + uniqueness).
  - Route writes (current MVP: tollbooth or allowlisted miner submits).
  - Route reads (canonical route PDAs in Design 3; existing per-wallet records remain usable).
- Off-chain witness receipts (client-signed) collected and aggregated by miners.
- Staking rewards (TOLL token) so users can earn funds to pay future tolls.

## 2) Roles

Everyday user (MVP: CLI/scripts; later: browser extension):

- Wallet/plugin + local cache.
- Verifies canonical route state on cache refresh.
- Generates witness receipts after verified observations.
- Pays tolls occasionally (MVP may be service-mediated).

Miner / Verifier (most decentralized path; shipped first):

- Receipt collection (HTTP) and off-chain verification.
- Aggregation (counts, stake-weight, Merkle root commitments).
- Quorum submission and canonical finalization on Solana (MVP: allowlisted).
- Earns rewards for heavy lifting + uptime.

Tollbooth / Gateway (explicitly centralized in MVP):

- Convenience layer to submit Solana transactions and provide fast resolution.
- Treated as untrusted: clients verify against chain and keep local cache.

## 2.1) MVP Incentives

MVP adoption wedge: domain owners get paid when the network is used.

Toll payments split (basis points, bps; must sum to `10,000`):
- `owner_bps`: paid to the domain owner payout wallet
- `miners_bps`: paid to miners/verifiers (aggregation + availability)
- `treasury_bps`: protocol treasury (funds rewards, ops, and safety budgets)

Domain owner registers:
- `name_hash` (e.g., `SHA256("example.com")` or `SHA256("alice.dns")`)
- payout wallet / token account
- desired split bps

**Payments are triggered by toll events, NOT per DNS query.**

Why not per-query?
- per-query is trivial to bot and breaks economics
- toll events represent scarce value (cache miss / acquisition / refresh), so revenue reflects real demand

### Privacy (MVP hard rule)

- Gateway witness receipts must not include client IP / user agent / wallet pubkeys / per-request IDs.
- Use time-bucketed observations (e.g., 10-minute buckets) to reduce tracking risk.
- Receipts are “answer facts” only (name_hash + rrset_hash + ttl + time bucket + witness signature).

## 3) MVP Resolution Flow (Cache-First)

Diagram-as-text:

```
Browser -> Gateway (DoH/TRR/TRDL) -> Wallet/Plugin Cache
  cache hit  -> answer immediately -> optionally emit receipt
  cache miss -> fetch answer -> verify on-chain -> cache -> emit receipt
```

Step-by-step:

1. Browser queries the gateway resolver.
2. Wallet/plugin checks local cache for `name_hash`.
3. Cache hit: answer immediately, optionally emit receipt.
4. Cache miss/expired:
   - call tollbooth (challenge/sign where required)
   - (optional) pay toll
   - receive route + proof bundle
   - verify canonical route on-chain
   - store locally with TTL cap
   - emit receipt after verification.

Call-out:

- No single authority can silently block because users retain cached routes and can independently verify canonical state; canonical changes require quorum (MVP quorum may be miner-whitelisted).

## 4) MVP Cache Update Strategy

- TTL-based refresh.
- Stale-while-revalidate background refresh near expiry.
- Conflict handling:
  - keep last-known-good
  - store new answers as pending until a canonical on-chain version is observed.

## 5) What Is Centralized in MVP

- Allowlisted miners/verifiers (aggregation admission is centralized).
- Tollbooth service (centralized submitter/fee-payer).
- Optional gateway resolver service.

Not yet decentralized in MVP:

- On-chain verification of each receipt/stake proof.
- Rotating stake-weighted committees and slashing.
- Browser extension distribution (Firefox).

---

Boxed callout:

**MVP**: allowlisted miners can submit aggregates; gateway/tollbooth is a bootstrap convenience layer.  
**End State**: anyone can verify; canonical routes finalize by stake-weighted quorum; receipt batches can be audited publicly.
