# Developer API (MVP + Planned)

This document summarizes developer-facing positioning and planned API surfaces.

## Why Devs Make More Money Using DDNS Nameservers
- Better default performance + debuggability via confidence-aware recursive answers.
- Policy-driven monetization paths (toll-share/rebate models) for projects that keep DDNS nameservers.
- Adapter-based interoperability (`.dns`, IPFS, ENS, SNS) without replacing existing stacks.

### Revenue + Cost Reduction via Automated Ops
- Devs/site owners can subscribe to decentralized backup + monitoring/auditing.
- Teams can reduce spend on traditional uptime monitoring and shift part of ops spend into reward flows for their community/premium domain operators.
- Attestations + proofs provide audit trails useful for compliance and user trust.

## Ops API / Attestations (Planned)
- Backup attestations:
  - `site_id`, `cid`, `bucket_ts`, `worker_sig`, optional `batch_root`
- Audit attestations:
  - `site_id`, `audit_type`, `version`, `bucket_ts`, `result_hash`, `worker_sig`
- Policy:
  - MVP: off-chain verification + policy-controlled acceptance
  - End state: stronger proof-backed verification and slashing for false attestations
