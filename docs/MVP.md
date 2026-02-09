# Design 3 MVP: Cache-as-Witness + Staking (Ship Now)

This MVP ships a working `.dns` flow on Solana devnet while explicitly allowing centralized bootstrap components. The system is structured so clients can verify what matters and later migrate to full decentralization.

## 1) What MVP Delivers

- `.dns` resolution through a gateway/tollbooth (fast path).
- Local cache on the user machine (cache-first).
- Solana programs as source of truth for:
  - Passport/TollPass identity + `.dns` name claim (anti-sybil + uniqueness).
  - Route writes (current MVP: tollbooth or allowlisted miner submits).
  - Route reads (canonical route PDAs in Design 3; existing per-wallet records remain usable).
- (Optional, MVP bootstrap) ICANN domain owner rewards:
  - domain owners can claim a `DomainClaim` and receive a revenue share in TOLL on paid tolls (see `solana/programs/ddns_rewards`).
  - verification is centralized in MVP (authority submits on-chain after off-chain TXT/HTTPS check).
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
- Domain verification for ICANN rewards (authority performs TXT/HTTPS checks off-chain and submits `claim_domain`).
- NS/DoH operators are not permissionless yet:
  - operator rewards are based on allowlisted watcher/miner submitted metrics (OFF-CHAIN verified in MVP).

Not yet decentralized in MVP:

- On-chain verification of each receipt/stake proof.
- Rotating stake-weighted committees and slashing.
- Browser extension distribution (Firefox).

## 6) ICANN Nameserver Adoption Incentives (MVP Bootstrap)

Goal: incentivize ICANN domain owners (e.g. `example.com`) to delegate NS to DDNS infra and receive TOLL revenue share.

On-chain (shipped):
- `ddns_rewards` program with `DomainChallenge` + `DomainClaim`, per-query revenue share on `pay_toll_with_domain`, and optional epoch bonus based on allowlisted usage aggregates.

Off-chain (MVP trust assumption):
- a centralized authority (gateway/tollbooth) verifies TXT/HTTPS control proof and then submits `claim_domain`.
- allowlisted miners/verifiers submit usage aggregates; receipts are NOT verified on-chain in MVP.

Quickstart: see `/Users/root1/scripts/DECENTRALIZED-DNS-/solana/README.md`.
