# Toll Tokens (SPL + L2 ERC-20)

Toll tokens can be split across chains:
- **SPL** (Solana) for Solana-native users
- **L2 ERC-20** for EVM users

## Scheme Selection
Receipts and auth can select signature scheme by token currency:
- `sol`, `wsol`, `spl_usdc`, `usdc_spl` → Ed25519
- `eth`, `usdc_erc20` → secp256k1

## Escrow
- SPL escrow lives in Solana programs
- L2 escrow lives in EVM smart contracts

Session tokens/vouchers should carry a `currency` field to select behavior.
