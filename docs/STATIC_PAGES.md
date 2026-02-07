# NFT Static Pages

Each NFT gets a single-page static site, served on a subdomain.

## Namespace
- Primary: `.dns` (private namespace resolved by our DNS).
- Fallback: `name.dns.rail.golf` for ICANN-compatible access.

## Registry
- Name records live on-chain (Solana) as `NameRecord` PDAs.
- Each record is tied to a Toll Pass NFT holder.
- Name is user-chosen and validated (4-13 chars, lowercase, reserved words blocked).

## Hosting
- Store the page on IPFS.
- Serve through our gateway for fast access.
- NFT metadata stores `page_cid_hash = sha256(page_cid)`.

## URL Format
- `https://<name>.dns` (private, via our resolver)
- `https://<name>.dns.rail.golf` (public fallback)

## Page Contents
- Static HTML or markdown rendered to HTML.
- Public profile, node status, and web3 services enabled.
