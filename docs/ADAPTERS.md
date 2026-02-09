# Adapters (ENS / SNS / PKDNS / IPFS) — MVP vs End State

This doc contains: **MVP ✅** and **End-State 🔮**.

## What “Adapter” Means

An adapter is a small, auditable module that can:
- **read** records/routes from an external system (chain, content network, upstream DNS),
- **verify** whatever is realistically verifiable in that system (MVP: best-effort),
- output a **normalized** `RouteAnswer` used by the gateway/resolver and miner tooling.

In MVP, adapters are primarily a **read + normalization layer**. End-state adds stronger proofs.

## Normalized Output: RouteAnswer

See: `gateway/src/route_adapters/types.ts`

Key fields:
- `name`, `nameHashHex` (sha256 of normalized name)
- `dest`, `destHashHex` (sha256 of normalized destination)
- `source.kind` (pkdns/ens/sns/ipfs/...)
- `proof` (merkle/onchain/signature/none)

## MVP Adapters (Implemented)

### PKDNS (`.dns`)

Where:
- Gateway implementation: `gateway/src/route_adapters/pkdns.ts`

MVP verification:
- loads local registry snapshot
- verifies Merkle proof
- optionally checks an anchored root (if present)
- optional: reads watchdog policy state from `ddns_watchdog_policy` when configured

Trust notes:
- Snapshot availability is still an operational dependency in MVP.
- Proofs make tampering detectable even if distribution is centralized.

### IPFS (CID)

Where:
- `gateway/src/route_adapters/ipfs.ts`

MVP verification:
- CID syntax validation only (no on-chain availability proofs)
- returns both `ipfs://CID` and a configured HTTP gateway URL

## MVP Adapters (Read-only, Basic Verification)

### ENS (`.eth`)

Where:
- `gateway/src/route_adapters/ens.ts`

MVP verification:
- reads ENS resolver via `eth_call`
- returns addr/contenthash as normalized `dest`

Limitations:
- No light client proofs in MVP. Upstream RPC trust is explicit.

### SNS (`.sol`)

Where:
- `gateway/src/route_adapters/sns.ts`

MVP verification:
- reads the SNS name account on Solana via RPC
- returns an owner reference as `dest`

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

# .dns via PKDNS registry snapshot
REGISTRY_ENABLED=1 REGISTRY_PATH=tests/fixtures/registry.json ANCHOR_STORE_PATH=tests/fixtures/anchors-empty.json \
  node dist/server.js

curl 'http://localhost:8054/v1/route?name=alice.dns'
curl 'http://localhost:8054/v1/route?name=ipfs://bafy...'
```

