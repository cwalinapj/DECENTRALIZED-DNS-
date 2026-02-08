# Storage Roadmap

## Phase 1
- Use Arweave, Storj, or Filecoin for public metadata.
- Use miner-local buckets for encrypted vault blobs.
- Optional encrypted snapshots to S3.

## Phase 2
- Build an internal decentralized storage layer using unused miner capacity.
- Provide pinning and redundancy policies.

## Policies
- Never store plaintext secrets off-device.
- Only publish coarse trust metadata.
- Treat IPFS as public even when accessed through a paid gateway.
