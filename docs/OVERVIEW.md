# TollDNS — Main Functions & Purpose

TollDNS is a **decentralized DNS and gateway platform** that combines standard Web2 DNS resolution
with verifiable on-chain components running on Solana. It is designed for developers who want
consistent, auditable, privacy-safe DNS with a clear migration path toward full decentralization.

---

## Why This Repo Exists

Traditional DNS is opaque: answers can be manipulated, valuable domain names can be lost to
expiration, and operators have no stake in accurate responses. TollDNS addresses this by:

- recording canonical route commitments on Solana so no single party can silently alter them
- rewarding miners that serve verified answers and operators that keep domains live
- giving developers a drop-in JSON API that is a strict superset of normal DNS responses
- protecting domain owners from expiration-loss through a continuity / anti-expiration layer

---

## Main Components

### 1. Gateway (`gateway/`)

The HTTP server that clients call directly. It handles:

| Endpoint | Purpose |
|---|---|
| `GET /v1/resolve?name=&type=` | Resolve ICANN (`netflix.com`) or `.dns` names to DNS records |
| `GET /v1/route?name=` | Verify the canonical on-chain route for a `.dns` name |
| `GET /dns-query` / `POST /dns-query` | RFC 8484 DNS-over-HTTPS (DoH) compatibility |
| `GET /v1/registrar/*` | Domain lookup, pricing quotes, renewal, nameserver updates |
| `GET /v1/domain/*` | Domain continuity status, ownership verification, expiry notices |
| `GET /v1/credits/*` | Per-account credit balance, credit/debit (for operators/miners) |
| `GET /v1/attack-mode` | Current network health / degradation policy |

**Resolution namespaces handled:**

- **ICANN** — recursive DoH quorum against multiple upstreams with TTL cache and confidence score
- **`.dns`** — Solana-backed PKDNS routes verified against on-chain PDAs
- **`.eth`** — ENS name resolution via Ethereum RPC
- **`.sol`** — Solana Name Service (SNS) account reads
- **IPFS CIDs** — CID syntax validation and availability probes

### 2. Core Library (`core/`)

Shared logic used across services:

- name normalization (trim, lowercase, strip trailing dots)
- `name_id` / `name_hash` derivation (SHA-256 of `label + ".dns"` or full name)
- `RouteSetV1` / `AnchorV1` encoding
- Ed25519 signing and verification
- BLAKE3 hashing helpers

### 3. Solana Programs (`solana/programs/`)

Sixteen on-chain programs (all prefixed `ddns_`):

| Program | Function |
|---|---|
| `ddns_registry` | Stores canonical `.dns` routes (name\_hash → dest\_hash proofs) |
| `ddns_names` | Identity and name claims (free subdomains + premium names) |
| `ddns_quorum` | Route finalization via witness-quorum voting |
| `ddns_stake` / `ddns_stake_gov` | Staking pools and governance over stake |
| `ddns_rep` | Reputation points awarded to early-adopter miners |
| `ddns_domain_rewards` | Domain-owner toll-share settlement |
| `ddns_witness_rewards` | Witness / miner reward aggregation by epoch |
| `ddns_rewards` | Unified reward distribution |
| `ddns_escrow` | Bonded access control (anti-abuse adoption gating) |
| `ddns_cache_head` | Premium parent cache-rollup heads (IPFS-backed) |
| `ddns_miner_score` | On-chain miner scoring and ranking |
| `ddns_operators` | Operator identity and capability registry |
| `ddns_watchdog_policy` | Policy state machine (OK / WARN / QUARANTINE + penalties) |
| `ddns_ns_incentives` | Usage-based rewards for ICANN DNS queries |
| `ddns_anchor` | Anchor PDA registry and settlement anchoring |

### 4. Cloudflare Worker Miner (`services/cf-worker-miner/`)

An edge resolver deployed as a Cloudflare Worker. It:

- receives DNS queries from clients
- queries multiple DoH upstreams in parallel
- returns a quorum response including `rrset_hash`, `confidence`, and `upstreams_used`
- earns REP (reputation points) in MVP; TOLL tokens on full launch

Deploy in ~3 minutes with `npm run miner:cf:deploy`.

### 5. Tollbooth / Witness Services (`services/tollbooth/`, `services/miner-witness/`)

Off-chain aggregation layer between miners and the Solana chain:

- **tollbooth** — validates witness signatures, checks TollPass PDAs, stores accepted routes
- **miner-witness** — collects client receipts, verifies them, aggregates by epoch/name/dest,
  then submits commitment transactions to Solana

### 6. Cache Rollup (`services/cache-rollup/`)

For premium `.dns` parent names, builds chronological cache roots, publishes them to IPFS, and
updates the on-chain `ddns_cache_head` PDA. This allows clients to verify cached answers
without a live RPC call.

### 7. Scripts (`scripts/`)

Key operational scripts:

| Script | What it does |
|---|---|
| `devnet_when_funded.sh` | **Canonical MVP demo** — deploy wave, inventory, strict on-chain flow |
| `devnet_deploy_wave.sh` | Deploy/verify all Solana programs with preflight balance checks |
| `devnet_inventory.sh` | Snapshot devnet state to `artifacts/devnet_inventory.json` |
| `devnet_happy_path.sh` | Full E2E: deploy → claim names → submit routes → aggregate |
| `check_program_id_sync.sh` | Gate: verify program IDs match across Anchor.toml and deploy keypairs |
| `check_no_protocol_drift.sh` | Gate: block breaking protocol changes |
| `dns-set-record.mjs` | CLI: write a DNS record to the on-chain registry |
| `registry-build-root.js` | Build a Merkle root from the local registry state |

---

## End-to-End Resolution Flow

```
Client (browser / app)
  │
  ▼
Gateway  ──ICANN──►  Multi-upstream DoH quorum  ──►  cached answer + confidence
  │
  └──.dns──►  Check on-chain PDA (ddns_registry)  ──►  canonical route + proof
                │
                ▼
           Tollbooth  ──►  miner-witness  ──►  Solana commitment tx
```

---

## Key Purposes at a Glance

| Purpose | Mechanism |
|---|---|
| Drop-in JSON DNS API | Gateway `/v1/resolve` returns structured JSON for any name type |
| Tamper-evident routing | Route commitments anchored on Solana; any change requires quorum |
| Domain continuity | Expired domains remain reachable in degraded mode; renewal credits available |
| Miner incentives | Workers earn REP (MVP) / TOLL (launch) for serving verified answers |
| Developer earnings | Operators earn toll-share credits for running nameservers |
| Privacy-safe telemetry | No raw IPs/UAs in receipts; 10-minute time bucketing |

---

## Quick Start

```bash
# Run the canonical MVP demo against Solana devnet
npm run mvp:demo:devnet

# Start the gateway locally
npm -C gateway ci && npm -C gateway run build
PORT=8054 npm -C gateway run start

# Resolve a name
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

See `docs/START_HERE.md` for the full onboarding path.
