# Design 3 MVP: Cache-as-Witness + Staking (Ship Now)

> This doc contains: [MVP ✅] [End-State 🔮]
>
> - MVP ✅: what is shippable today (centralized bootstrap allowed)
> - End-State 🔮: noted only as “future” and not implemented yet

This MVP ships a working `.dns` flow on Solana devnet while explicitly allowing centralized bootstrap components. The system is structured so clients can verify what matters and later migrate to full decentralization.

**MVP callout**: centralized pieces still exist (gateway availability, allowlisted miners).  
**End state**: fully decentralized quorum + stake-weighted witnesses + optional public receipt batches.

## 1) What MVP Delivers

- `.dns` resolution through a gateway/tollbooth (fast path).
- Local cache on the user machine (cache-first).
- Solana programs as source of truth for:
  - Passport/TollPass identity + `.dns` name claim (anti-sybil + uniqueness).
  - Route writes (current MVP: tollbooth or allowlisted miner submits).
  - Route reads (canonical route PDAs in Design 3; existing per-wallet records remain usable).
- Off-chain witness receipts (client-signed) collected and aggregated by miners (MVP: off-chain verification).
- Staking rewards (TOLL token) so users can earn funds to pay future tolls (mechanics are minimal in MVP).
- REP capability accrual via `ddns_rep` (bonded, capped, diversity-gated) for miner status and future edge-host eligibility.

Verification logs (devnet/localnet commands + tx signatures) live in:

- `docs/STATUS.md`
- `solana/VERIFIED.md`

## Run The MVP (Devnet)

Prereqs:

- Solana CLI configured and funded keypair (payer/owner)
- Node.js + npm

Build IDLs:

```bash
cd solana
npm install
anchor build
```

Start gateway (optional; for adapter-based resolves):

```bash
cd gateway
npm install
npm run dev
```

Start toll-booth service (optional; centralized bootstrap path):

```bash
cd services/toll-booth
npm install
npm run dev
```

Proof pointers (what to look for on-chain):

- TollPass proof: PDA `["toll_pass", owner_wallet]` exists on-chain (owner identity).
- Canonical route proof (Design 3): PDA `["canonical", name_hash]` exists on-chain (route hash + TTL).
- Policy hint proof (optional): `NamePolicyState` PDA in `ddns_watchdog_policy` (OK/WARN/QUARANTINE + TTL cap + penalty).

## 2) Roles

Everyday user (MVP: CLI/scripts; later: browser extension):

- Wallet/plugin + local cache.
- Verifies canonical route state on cache refresh.
- Generates receipts (client-signed) after verified observations.
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

Not yet decentralized in MVP:

- On-chain verification of each receipt/stake proof.
- Rotating stake-weighted committees and slashing.
- Browser extension distribution (Firefox).

## MVP Incentives (Adoption Wedge)

MVP adoption wedge: domain owners get paid when the network is used.

Toll-event payment split (basis points, bps; sums to `10,000`):

- domain owner share (payout wallet)
- miners/verifiers share (aggregation + availability)
- treasury share (protocol funding)

Why not “per-query payouts” in MVP:

- raw query counts are trivial to bot and break economics
- toll events represent scarce value (route acquisition/refresh), so wash behavior costs real funds.

REP in MVP:
- REP is non-transferable reputation for miners.
- REP is awarded per aggregate with anti-sybil controls (bond + cooldown + daily cap + diversity gates).
- REP currently grants status and future capability tiers; it does not mint free TOLL.

## Privacy Notes (MVP)

- Witness receipts must not include client IP, user agent, wallet pubkeys, or per-request IDs.
- Observations should be time-bucketed (e.g., 10-minute buckets) to reduce tracking surface.

## MVP: Watchdogs + Policy (Bootstrap)

MVP includes a lightweight policy layer to emit compact routing hints. In MVP, submissions are centralized/allowlisted and signatures can be verified off-chain.

What’s implemented:

- `ddns_watchdog_policy` on-chain program:
  - allowlisted watchdog identities (who observations are attributed to)
  - allowlisted submitters (who can post digests)
  - per-name policy state: OK / WARN / QUARANTINE + penalty and TTL caps
- Attestations are submitted as **digests** (no on-chain signature verification in MVP).

How other components use policy:

- resolvers/gateways read `NamePolicyState`
  - `WARN`: prefer short TTL, show warning
  - `QUARANTINE`: warn strongly; require explicit override
- miners/operators can apply `penalty_bps` to rewards off-chain in MVP.

See:

- `docs/PROTOCOL_WATCHDOG_ATTESTATION.md`
