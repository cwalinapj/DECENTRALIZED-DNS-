# Attack Mode (Degradation Rules + Thresholds)

This doc contains: **MVP ✅** and **End-State 🔮**.

Attack mode is a deterministic safety layer that:
- detects likely active adversaries (censorship, spam, eclipse, poisoning),
- degrades behavior to protect users and preserve auditability,
- prioritizes “miners-first robustness” while keeping “users-light” flows viable.

## Finite-State Machine

Modes:
- **NORMAL**
- **SUSPICIOUS**
- **UNDER_ATTACK**
- **ISOLATED** (no trustworthy quorum sources reachable or disagreement detected)
- **RECOVERY**

Key rules:
- transitions use bounded hysteresis (don’t flap)
- **ISOLATED** is fail-closed for writes, fail-open for serving cache

### Signals (inputs)

Signals are computed off-chain by gateway/miners/clients:
- `rpcFailPct`: RPC failures over rolling window (e.g. 2 minutes)
- `rpcDisagreement`: >= 2 RPC URLs disagree on account data hash
- `gatewayErrorPct`: error rate spikes
- `invalidReceiptPct`: invalid receipts / total receipts in window
- `canonicalFlipCount`: per-name canonical flips in a time window
- `routeVolatility`: rate of changes above expected TTL dynamics
- `ipfsFailPct`: IPFS gateway failure ratio

### Thresholds (default MVP)

These are defaults. Implementations expose env overrides.

- if `rpcFailPct > 30% over 2 minutes` => **SUSPICIOUS**
- if `invalidReceiptPct > 5% over 500 receipts` => **UNDER_ATTACK**
- if `rpcDisagreement >= 1` => **ISOLATED** (freeze writes)
- if `canonicalFlipCount > 2 within 30 minutes` => **UNDER_ATTACK** for that name

Recovery:
- from **UNDER_ATTACK** -> **RECOVERY** after 10 minutes below thresholds
- from **RECOVERY** -> **NORMAL** after additional 10 minutes stable

## Policies by Mode (Knobs)

Policy knobs exposed to components:
- `minRpcQuorum`
- `requireStakeForReceipts`
- `maxReceiptsPerWalletPerMin`
- `maxWritesPerWalletPerHour`
- `freezeWrites` (boolean)
- `ttlClampS`

Recommended MVP defaults:

| Mode | minRpcQuorum | requireStakeForReceipts | freezeWrites | ttlClampS |
|---|---:|---:|---:|---:|
| NORMAL | 1 | false | false | 0 |
| SUSPICIOUS | 2 | false | false | 300 |
| UNDER_ATTACK | 3 | true | true (hot names) | 60 |
| ISOLATED | 2 (but must agree) | true | true | 60 |
| RECOVERY | 2 | false | false | 300 |

Notes:
- “freezeWrites (hot names)” means: refuse writes for names that have volatility/censorship signals.
- TTL clamp applies to *serving* decisions and cache retention, not to canonical truth.

## Degradation Rules by Component

### Wallet / Client (CLI now; extension later)

**NORMAL**
- serve cache if fresh; refresh from canonical when TTL expires
- accept canonical updates from 1 trusted RPC/gateway with proof validation

**SUSPICIOUS**
- cache-first + stale-while-revalidate
- refresh only when canonical confirmed by `minRpcQuorum` RPC URLs

**UNDER_ATTACK**
- freeze cache updates unless:
  - canonical confirmed by >= 3 RPC URLs AND
  - (if available) independent miner evidence agrees
- do not pay toll for “hot” names

**ISOLATED**
- serve only local cache (TTL clamp)
- queue writes locally for later

### Miner / Witness Aggregator

**NORMAL**
- accept receipts; aggregate by epoch; submit aggregates as usual

**SUSPICIOUS**
- raise admission requirements:
  - stricter freshness window
  - stronger signature verification auditing (off-chain)

**UNDER_ATTACK**
- enforce rate limits:
  - per-wallet receipts per minute cap
- require stake/passport for receipt admission (`requireStakeForReceipts`)
- delay finalization: require higher thresholds (off-chain gate)

**ISOLATED**
- stop submitting aggregates; only log/store evidence (batches, roots)

### Gateway / Tollbooth

**NORMAL**
- serve resolve
- allow route purchase / route writes (if implemented)

**SUSPICIOUS**
- require stronger auth (challenge+signature)
- enforce spend caps / write caps per wallet

**UNDER_ATTACK**
- **read-only mode** for hot names
- disable write endpoints if `freezeWrites`
- raise toll prices only if transparent (documented)

**ISOLATED**
- refuse all writes
- serve cached + canonical reads only (with TTL clamp)

### On-chain enforcement (what we can enforce now)

MVP on-chain enforces:
- epoch windows
- min thresholds (`min_receipts`, `min_stake_weight`) over aggregates
- allowlisted submitters (MVP)

Attack-mode on-chain knobs (MVP):
- governance/authority can raise thresholds during attacks
- TTL caps for canonical routes

End-state:
- dynamic governance-controlled thresholds
- proof-backed penalties and slashing

