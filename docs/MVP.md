# Design 3 MVP: Cache-as-Witness + Staking (Ship Now)

> This doc contains: [MVP ✅] [End-State 🔮]
>
> - MVP ✅: what is shippable today on devnet (centralized bootstrap allowed)
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
- Off-chain witness receipts (client-signed) collected and aggregated by miners.
- Staking rewards (TOLL token) so users can earn funds to pay future tolls.

## Run The MVP (Devnet, Verified)

Prereqs:

- Solana CLI configured and funded keypair (payer/owner)
- Node.js + npm

Build IDLs:

```bash
cd solana
npm install
anchor build
```

Start toll-booth service (local):

```bash
cd services/toll-booth
npm install
npm run dev
```

Mint TollPass (devnet) for a wallet:

```bash
cd solana
npm run mint-toll-pass -- --rpc https://api.devnet.solana.com --wallet /path/to/wallet.json --name <label>
```

Create a route + have 2 trusted witnesses sign it:

```bash
cd solana
npm run route:create -- --name <label>.dns --dest <dest> --ttl 300
npm run route:sign-witness -- --route-id <route_id> --keypair /path/to/witness1.json
npm run route:sign-witness -- --route-id <route_id> --keypair /path/to/witness2.json
```

Submit to toll-booth (quorum) and write on-chain name record (devnet):

```bash
cd solana
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=/path/to/wallet.json \
TOLL_BOOTH_URL=http://localhost:8787 \
npm run set-route -- --name <label>.dns --dest <dest> --ttl 300
```

Proof pointers:

- TollPass proof: PDA `["toll_pass", owner_wallet]` exists on-chain (owner identity)
- NameRecord proof: PDA `["name", name_hash]` exists on-chain (name -> dest_hash metadata)

## Verified Example (Devnet, 2026-02-09)

This was run end-to-end on devnet (see `STATUS.md` for the full log of ids/sigs):

- Mint TollPass tx: `4JFCsqiMwPZ5exhMvcSfXueuwBRXMVRM1QAb4soTncTrR7qmnBoRuC5nWNn6HJd68MKPW1YtAv2CzT8fEDGBjaUy`
- Set route tx: `2uWiHYhNBwMU9cqwGsrgYd9XoAjrVAWA9n1fartoQb5UQrpLewBY9wFLnCAzN2DWVssuiPFd7HbeFkMGHPyqGLRE`
- name: `ea5m123.dns`
- `name_hash`: `32e1cdf368103a48f7c44807d5a2e1b9d1a949d481d4ea38f47a62c2fec9e3d7`
- `dest_hash`: `100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9`

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

## Privacy Notes (MVP)

- Witness receipts (gateway-signed) must not include client IP, user agent, wallet pubkeys, or per-request IDs.
- Observations should be time-bucketed (e.g., 10-minute buckets) to reduce tracking surface.
