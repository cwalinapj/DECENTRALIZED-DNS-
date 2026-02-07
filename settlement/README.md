# Settlement Contracts (Batch Spend + Rewards)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This folder specifies contracts that:

- settle Index Unit spending in batches (from SpendEscrow),
- validate Proof-of-Serving receipts,
- and distribute **native token** rewards to operators and contributors.

Key principle:

- **Index Units** are spent by users for usage.
- **Native token** is paid out for mining/operator rewards, integrations, grants, and ecosystem ops.

Related:

- Tokenomics: `docs/05-tokenomics.md`
- Receipt format: `specs/receipt-format.md`

---

## Contracts in this Module

### 1) SettlementCoordinator (optional name)

Tracks epochs and allows authorized settlement submitters (resolvers/settlers) to post:

- voucher spend totals
- receipt roots
- payout calculations (or inputs to calculation)

**Purpose**

- define “what epoch are we settling?”
- prevent double settlement

---

### 2) ReceiptIngestor

Validates receipts or receipt batch roots:

- signature verification
- operator registry checks
- policy version alignment
- optional audit proofs (Merkle leaf proofs)

**Purpose**

- prevent fake traffic claims
- enable scalable settlement

---

### 3) RewardDistributor

Computes and distributes native token payouts based on:

- verified receipts
- reward multipliers (region scarcity, diversity, anycast, scrubbing, attack mode)
- caps (per operator/ASN/region) to reduce centralization

**Purpose**

- pay for delivered service, not claimed capacity

---

### 4) Treasury / Reserves Link

Settlement may allocate a portion of Index Unit revenue to:

- treasury reserves (native or Index, depending on design)
- grants/subsidies pools
- burn mechanism triggers

(Exact splits are DAO parameters.)

---

## Required Invariants

- Each epoch/window can be settled at most once (or strictly versioned).
- Receipts MUST be verifiable and tied to registered operators.
- Reward caps must be enforceable.
- Policy version used during service MUST be referenced in receipts for auditability.

---

## Suggested Settlement Flow (High-Level)

1) Resolver/settler submits:
   - aggregated voucher spends (Index Units)
   - receipt roots (proof-of-serving)
2) Escrow debits Index Units per user (batched)
3) Rewards distributed in native token to operators
4) Treasury allocations and burn triggers processed (if enabled)

---

## Suggested Events

- `EpochOpened(epoch_id)`
- `SpendSettled(epoch_id, total_index_units)`
- `ReceiptRootSubmitted(epoch_id, operator_id, merkle_root)`
- `RewardsDistributed(epoch_id, total_native)`
- `EpochClosed(epoch_id)`
