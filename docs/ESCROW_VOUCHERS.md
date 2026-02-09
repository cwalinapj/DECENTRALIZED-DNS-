# Escrow + Toll Vouchers (MVP)

This is the MVP settlement mechanism for **toll events** (cache-miss / route acquisition). It does **not** do per-DNS-query on-chain payments.

## Why Vouchers

- Users pre-deposit TOLL into a **UserEscrow vault** (owned by a PDA).
- A trusted MVP signer (tollbooth) issues a **TollVoucher** authorizing spend from the vault.
- Anyone can redeem the voucher on-chain; redemption is **replay-protected**.

This keeps “pay only when value happens” (route acquisition), without spamming the chain for every query.

## Split Payout (bps)

On redemption, the program splits a toll event into:

- **domain owner** (adoption / NS incentives)
- **miners/verifiers pool** (quorum + witness work)
- **treasury** (protocol funding)

All splits are configured in **basis points** (bps) and must sum to `10_000`.

Example:

- `domain_bps = 1000` (10%)
- `miners_bps = 2000` (20%)
- `treasury_bps = 7000` (70%)

For `amount = 10 TOLL`, payout is `1 / 2 / 7`.

## Trust Model (MVP)

- Voucher signatures are accepted only from an **allowlisted signer set** (EscrowConfig).
- Receipt/proof verification is **off-chain** in MVP; on-chain only enforces:
  - signer is allowlisted
  - voucher time window is valid
  - voucher replay protection
  - deterministic split transfers

End-state upgrade path: replace allowlisted signers with quorum / stake-weighted authorization.

## Program (Anchor)

- Program: `ddns_escrow`
- PDAs:
  - `["escrow_config"]` (config)
  - `["escrow", user_wallet]` (UserEscrow)
  - `["vault", user_wallet]` (UserEscrow token vault)
  - `["domain_owner", name_hash]` (DomainOwner payout target)
  - `["redeemed", payer_pubkey, nonce_le]` (replay protection)

## Voucher Format (off-chain, signed)

The voucher is a fixed-size Borsh struct `VoucherV1` and the signer signs:

`sha256("DDNS_VOUCHER_V1" || borsh(VoucherV1))`

In MVP, the signer is the tollbooth (allowlisted). Later, signer authority becomes decentralized.

