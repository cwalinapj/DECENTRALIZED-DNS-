# Trust Scores (Off-Chain)

Trust scores are computed off-chain and can be published as coarse metadata to IPFS.
Public access can be metered via a paid gateway, even though IPFS itself is public.

## Goals
- Reward stable, honest wallets.
- Detect abuse and rate-limit high-risk wallets.
- Keep raw signals private.

## Signal Inputs
- Voucher success rate and replay attempts
- Receipt dispute rate
- Session token abuse rate
- Miner uptime and job completion
- Escrow health and chargeback events

## Output Format (Public Metadata)
Publish a coarse score band and tier, not raw statistics.
```json
{
  "wallet_id": "wallet-1",
  "trust_tier": "silver",
  "score_band": "700-750",
  "last_verified_at": "2026-02-07T00:00:00Z",
  "miner_class": "raspi"
}
```

## Publication Strategy
- Store metadata JSON on IPFS and point NFT metadata to the CID.
- Serve via a paid gateway for monetization.
- Keep a private, richer score record in miner buckets or S3.
