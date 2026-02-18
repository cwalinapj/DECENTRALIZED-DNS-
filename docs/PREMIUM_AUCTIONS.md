# Premium Auctions (MVP)

This document defines premium `.dns` allocation rules in MVP.

## Policy
- `L <= 2` (label length): reserved to treasury authority only.
- `L = 3` or `L = 4`: auction-only. Direct premium purchase is blocked.
- `L >= 5`: normal premium registration path remains available.

## On-Chain Accounts
- `PremiumConfig` PDA: `["premium_config"]`
- `Auction` PDA: `["auction", name_hash]`
- `BidEscrow` PDA: `["escrow", name_hash, bidder]`

## Flow
1. Authority creates auction for a `3-4` character premium label.
2. Bidders place bids against auction escrow.
3. Losing bidders call `withdraw_losing_bid`.
4. After end slot, winner settles auction and receives premium ownership.

## MVP Notes
- Reservation and auction gating are enforced in premium ownership creation.
- `1-2` char labels are not publicly mintable in MVP.
- Future roadmap:
  - commit-reveal bids
  - permissionless auction creation
  - auctioning `1-2` char labels
