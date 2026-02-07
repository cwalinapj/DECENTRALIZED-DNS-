# Economics & Settlement

This document describes how TollDNS charges per-query tolls and pays
miners without requiring on-chain transactions for every DNS request.

## Goals

Charge a small toll for each DNS resolution (and/or gateway resolution).
Avoid per-query on-chain settlement (latency + cost).
Prevent "approve every payment" popups via escrow + local spend rules.
Pay miners for real delivered service, not just registration.

## Roles

Client: phone/desktop/router app that runs a local DNS stub + wallet.
Resolver: paid recursive DoH/DoT service that validates payment vouchers
  and performs recursion/routing.
Miner: provides gateway/caching/edge capacity; gets paid based on
  delivered service.
L2 Chain: accounting + control plane (escrow, registry, rewards/payouts).

## Payment Model Overview

### Escrow (On-Chain)

Users deposit tokens into an escrow contract on the project's L2. The
escrow balance authorizes spending without interactive prompts.

Client-side spend protections (enforced locally):

Max spend per day/week/month
Max spend per domain/category
Resolver allowlist / denylist
Minimum balance threshold + emergency stop
Optional "surge pricing" caps

### Off-Chain Vouchers (Per Query)

Each request includes a signed voucher authorizing payment. The resolver
verifies it instantly (signature + sequence checks).

Key design choice (recommended initially):

- Users pay the Resolver
- The resolver pays Miners during batch settlement
- This keeps the client trust model simple and makes failover easy.

### Voucher Fields (Suggested)

A voucher is a signed message containing:

user_pubkey (payer identity)
resolver_id (payee identity)
amount (toll for this query)
seq (monotonic sequence number per user+resolver)
expiry (timestamp)
policy_id (optional: bind to a client policy profile)
query_commitment (optional: hash of qname/qtype + time bucket)
sig (signature over all fields)

### Why a Sequence Number?

To prevent replay and double-spend. The resolver tracks the last accepted
seq (or a small window).

### Settlement (Batch, On-Chain)

Resolvers aggregate vouchers off-chain and periodically settle in batches:

Resolver submits a batch settlement transaction to escrow:
identifies users
claims total amounts for accepted vouchers
provides a compact proof (implementation-dependent)
Escrow releases funds to:
resolver fee
miner payout pool (or direct miner payouts)
optional protocol/insurance fee

### Suggested Fee Split (Example)

Configurable, but a common split is:

Miner service share: 70-85%
Resolver share: 10-20%
Protocol/insurance: 0-10%

### Miner Receipts (Proof-of-Serving)

To ensure miners get paid only for real work:

A miner returns a response plus a receipt proving service occurred.
The resolver validates correctness + SLO and records a "payable unit."
Receipt can include:

miner_id
request_id (hash)
bytes_served (for gateways)
served_at (timestamp)
latency_class (bucketed)
sig_miner (miner signature)

The resolver may also sign an acknowledgement (useful if disputes exist
later).

### Disputes & Fraud (Optional Early, Stronger Later)

Early-phase (simpler):

Rely on seq monotonicity + short expiry + resolver reputation.
Keep disputes off-chain; settle conservatively.

Later (stronger):

Introduce challenge windows and fraud proofs:
prove voucher reuse
prove invalid receipts
slash resolvers/miners for provable misconduct

## Notes

This design deliberately keeps the L2 out of the hot path.
DoH/DoT transport is recommended to reduce UDP reflection risk and enable
authenticated clients.
