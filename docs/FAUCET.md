# Toll Token Faucet (Stub)

This repo does not include a production faucet. This document defines the expected
behavior for a **development faucet** so normal users can test without purchasing tokens.

## Goals
- Support SPL toll tokens (Solana) and L2 ERC-20 toll tokens (EVM).
- Rate-limit to prevent abuse.
- Require minimal friction (captcha or wallet signature).

## Suggested Flow (Dev)
1. User requests faucet with wallet address + chain + token.
2. Faucet verifies rate limits and anti-bot check.
3. Faucet dispenses a small amount to bootstrap usage.

## SPL Faucet (Solana)
- Use a devnet mint with a mint authority held by the faucet.
- Token account is created if missing.
- Transfer a small amount (e.g., 0.5–1.0 USDC devnet).

## L2 Faucet (EVM)
- Use an ERC-20 test token (mintable on L2 testnet).
- Faucet contract mints to requester or holds reserve balance to transfer.

## Rate Limit Ideas
- 1 request / 24 hours per wallet
- 1 request / IP / 24 hours
- Global daily cap

## Security Notes
- Never run a faucet on mainnet.
- Use separate dev/test tokens and endpoints.
