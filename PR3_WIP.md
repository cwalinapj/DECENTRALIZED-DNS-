# PR3 WIP: CLI + Miner Witness Daemon (Design 3 MVP)

This branch is the start of PR3.

Target deliverables (per spec):

- TS CLI scripts:
  - stake / unstake / claim
  - make_receipt (DDNS_RECEIPT_V1)
  - submit_receipts (HTTP batch upload to miner)
- Miner witness daemon service:
  - receipt ingestion + off-chain verification
  - aggregation (receipt_count, stake_weight, receipts_root)
  - submit_aggregate + finalize_if_quorum on devnet

Acceptance goal:

1. stake some amount
2. create receipts locally
3. miner submits aggregate
4. CanonicalRoute updates only after quorum thresholds

Notes:

- MVP allows miner allowlisting and off-chain receipt verification.
- On-chain roots are stored for upgrade path (future proofs/slashing).

