# Escrow Contracts (Index Unit Spend)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This folder specifies contracts that manage **Index Unit** spending for TollDNS usage (DNS queries, gateways, and future “Cloudflare-like” features).

**Key rule:** Users pay usage tolls in **Index Units**, not the native token.

Index Unit escrow exists to:
- remove per-request approval prompts,
- support voucher-based micro-payments,
- and enable batch settlement.

Related:
- Tokenomics: `docs/05-tokenomics.md`
- Receipt format: `specs/receipt-format.md`

---

## Contracts in this Module

### 1) SpendEscrow
Holds Index Units on behalf of users and supports:
- deposits/withdrawals
- spend ceilings (client-controlled policies expressed on-chain as allowances/limits)
- settlement debits (done in batches)

**Core responsibilities**
- track balances per user (and optionally per sub-account)
- enforce withdrawal restrictions (e.g., cooldowns if needed)
- support “authorized settlement submitters” (resolvers/settlers)

**Non-goals**
- per-query on-chain payment
- storing raw DNS queries

---

### 2) VoucherBook (or VoucherVerifier)
Validates signed vouchers and accumulates spend for batch settlement.

**Voucher concept**
A voucher is a signed authorization from a user that permits a resolver/edge to deduct up to X Index Units under specific constraints.

Voucher validation MUST be cheap and MUST prevent replay.

---

## Required Invariants

- Escrow debits MUST never exceed available balance.
- Voucher replay MUST be prevented (nonce/sequence).
- Voucher scope MUST be enforced (max amount, expiry, resolver binding if used).
- Settlement MUST be auditable (epoch/window references, policy version).

---

## Suggested Interfaces (Non-code)

### SpendEscrow
- `deposit(user, amount)`
- `withdraw(user, amount)`
- `balanceOf(user) -> amount`
- `setSpendingLimits(user, limits)` (optional; can be off-chain enforced too)
- `debitForSettlement(user, amount, settlement_id)` (authorized role only)

Events:
- `Deposited(user, amount)`
- `Withdrawn(user, amount)`
- `Debited(user, amount, settlement_id)`

### VoucherBook / VoucherVerifier
- `submitVoucher(voucher, amount_claimed, settlement_id)`
- `markVoucherUsed(voucher_id)` (or sequence-based)
- `getVoucherState(user) -> (last_nonce, last_seq, ...)`

Events:
- `VoucherAccepted(user, voucher_id, amount_claimed, settlement_id)`
- `VoucherRejected(user, voucher_id, reason_code)`

---

## Notes / Open Choices

- Voucher binding:
  - bind to a specific resolver/operator key vs allow any authorized settler
- Dispute model:
  - optimistic acceptance with fraud proofs vs strict validation only
- Privacy:
  - never include raw domain names; only include hashed request summaries if needed
