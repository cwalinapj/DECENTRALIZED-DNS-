README.md
PROSPECTUS.md
/docs
  00-vision.md
  01-architecture-overview.md
  02-resolution-backends.md
  03-watchdogs-and-fallback.md
  04-functional-equivalence-proofs.md
  05-tokenomics.md
  06-resilience-tokenomics.md
  07-routing-engine.md
  08-threat-model.md
  09-roadmap.md
  flow-diagram.md
/specs
  Backend-Adaptor-Interface
  economic-settlement.md
  health-report-format
  spam-report-format.md
/contracts
  README.md
  escrow/
  registry/
  policy/
  settlement/
  proofs/
/adaptors
  README.md
  dns-icann/
  dns-upstream-quorum/
  ipfs/
  filecoin/
  arweave/
  ens/
  unstoppable/
  solana-sns-bonfida/
  handshake/
  pkdns-pkarr/
  tor-odoH/
/watchdogs
  README.md
  verifier-node/
  regional-probers/
  oracle-attesters/
  incident-detector/
/client
  README.md
/resolver
  README.md
/miner
  README.md

  Why this layout
	•	/docs = narrative “prospectus” (what + why)
	•	/specs = exact formats + state machines (how)
	•	/adaptors = “we integrate existing networks” in a clean plug-in way
	•	/watchdogs = the off-chain measurement layer that feeds your immutable on-chain policy
	•	/contracts = your L2 logic (escrow, registry, policy, settlement, proofs)
