# Toll Pass NFT (Soulbound)

One NFT per wallet. Required for access to the edge network and toll gates.

## Goals
- Reduce attack surface by gating access to valid wallets.
- Onboard users without requiring gas-heavy onboarding.
- Enforce a fair playing field (non-transferable).

## Key Rules
- **One per wallet** (soulbound).
- **Non-transferable** (no secondary markets).
- **Credits** only via:
  - Burning native tokens (rate TBD).
  - Faucet rewards for **aged high-trust** NFTs (policy enforced off-chain).

## Metadata
- NFT points to a CID containing coarse public metadata (tier/age band).
- Each NFT is assigned one `.dns` name (private namespace).
- Name rules:
  - 4-13 chars
  - lowercase letters, digits, hyphen
  - no leading/trailing hyphen
  - reserved words blocked
- On-chain stores:
  - `name_hash` = `sha256(name)`
  - `name_bytes` + `name_len`
  - `page_cid_hash` = `sha256(page_cid)`
  - `metadata_hash` = `sha256(metadata_cid)`
- Sensitive data never stored in plaintext.

## Trust + Faucet Policy
- Faucet rewards only if the wallet:
  - Has high trust score.
  - Has aged beyond a minimum (TBD).
  - Uses the toll gate and web3 protocol features (usage-based eligibility).

## Airdrops vs Faucet
- **Airdrops** are used for high-trust wallets using DNS only (no other features).
- **Faucet** is reserved for broader feature usage and will be usage-based.
- Users without a valid pass are routed to traditional DNS.

## Solana Implementation (Phase 1)
- PDA `toll_pass` keyed by wallet:
  - owner
  - issued_at
  - name_hash
  - page_cid_hash
  - metadata_hash

## Metaplex NFT (Soulbound)
- Minted during issue flow.
- Token account is frozen by program PDA.
- Mint authority is revoked after mint.
- Metadata and master edition are created via Metaplex CPI.

## DAO Gate (Solana)
- Voting requires:
  - Toll Pass NFT
  - Token lock >= 30 days
- Token lock PDA: `lock` keyed by wallet (amount + unlock_at)
- Compressed NFT minting can be added later (Bubblegum CPI).

## Phase 2
- Compressed NFT mint + on-chain revocation registry.
- Full integration with toll ledger.
