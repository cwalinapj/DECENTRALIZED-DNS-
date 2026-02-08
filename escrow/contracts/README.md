# Escrow Contracts

This folder contains on-chain stubs for the Index Unit escrow system.
These are scaffolds intended for devnet/testing; production requires full
ECDSA signature verification, access control, and audits.

## Contracts
- `SpendEscrow.sol` – balances + settler debits + spend limits.
- `VoucherVerifier.sol` – voucher replay protection and nonce tracking.

## Notes
- `SpendEscrow` does not transfer ERC-20 tokens yet; it tracks balances
  for Index Units (internal accounting) and is used by settlement.
- `VoucherVerifier` currently validates nonces and uniqueness only. It
  should be extended to verify ECDSA signatures and scope constraints.
