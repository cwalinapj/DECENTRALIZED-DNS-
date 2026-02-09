# Adapters (ENS / SNS / PKDNS / IPFS) — MVP vs End State

This doc contains: **MVP ✅** and **End-State 🔮**.

## What “Adapter” Means

An adapter is a small, auditable module that can:
- **read** records/routes from an external system (chain, content network, upstream DNS),
- **verify** whatever is realistically verifiable in that system (MVP: best-effort),
- output a **normalized** `RouteAnswer` used by the gateway/resolver and miner tooling.

In MVP, adapters are primarily a **read + normalization layer**. End-state adds stronger proofs.

## Normalized Output: RouteAnswer

See: `gateway/src/adapters/types.ts`

Key fields:
- `name`, `nameHashHex` (sha256 of normalized name)
- `dest`, `destHashHex` (sha256 of normalized destination)
- `source.kind` (pkdns/ens/sns/ipfs/...)
- `proof` (merkle/onchain/signature/none)

## MVP Adapters (Implemented)

### PKDNS (`.dns`)

Where:
- Gateway implementation: `gateway/src/adapters/pkdns.ts`

MVP verification:
- reads canonical route state from Solana `ddns_registry`
  - CanonicalRoute PDA: `["canonical", name_hash]`
  - `name_hash = sha256(normalized_name)`
- optional: reads `NamePolicyState` from `ddns_watchdog_policy`

Trust notes:
- MVP uses RPC reads (trust assumptions: RPC availability + correctness).
- End-state can add multi-RPC and light client verification.
- **MVP chain stores `dest_hash` only**. PKDNS is a verifier unless you supply a candidate `dest` (or configure a witness URL) and it can validate `sha256(dest)` matches on-chain `dest_hash`.

MVP modes:
- Verify-only (no witness):
  - `GET /v1/route?name=alice.dns&dest=https://...`
- Resolve+verify (requires `DDNS_WITNESS_URL`):
  - `GET /v1/route?name=alice.dns`
  - witness returns `{ "dest": "...", "ttl_s": 300 }`
  - PKDNS returns `verified=true/false` and includes canonical proof fields.

### IPFS (CID)

Where:
- `gateway/src/adapters/ipfs.ts`

MVP verification:
- CID syntax validation only (no on-chain availability proofs)
- optional: `HEAD` check against configured gateways to confirm availability

## MVP Adapters (Read-only, Basic Verification)

### ENS (`.eth`)

Where:
- `gateway/src/adapters/ens.ts`

MVP verification:
- reads ENS resolver via `eth_call`
- returns `contenthash` preferred, then `text("url")`, then `addr()`

Limitations:
- No light client proofs in MVP. Upstream RPC trust is explicit.

### SNS (`.sol`)

Where:
- `gateway/src/adapters/sns.ts`

MVP verification:
- reads the SNS name account on Solana via RPC
- returns URL-like text from registry data if present, otherwise owner reference

## End-State (Planned / Stubs)

Not implemented yet, but the adapter registry includes stubs:
- Handshake
- Filecoin
- Arweave

End-state direction:
- multiple independent RPC endpoints
- quorum corroboration
- light client proofs where feasible
- dispute windows + slashing for provably false adapter outputs

## Quick Usage (Gateway)

Run the gateway and query a normalized route:

```bash
cd gateway
npm i
npm run build

# normalized route answers (auto)
node dist/server.js
curl 'http://localhost:8054/v1/route?name=vitalik.eth'
curl 'http://localhost:8054/v1/route?name=bonfida.sol'
curl 'http://localhost:8054/v1/route?name=ipfs://bafy...'

# PKDNS verify-only:
curl 'http://localhost:8054/v1/route?name=alice.dns&dest=https://example.com'
```
