# Verifier Node (Watchdog)

A verifier node is authorized (by verifier set membership) to:

- run periodic backend probes
- run conformance challenge checks (bounded)
- submit signed Health Reports for policy aggregation

Inputs:

- backend registry snapshot (enabled backends, policies, verifier set)
- challenge set pointers (CIDs/hashes)
- probe targets and measurement config

Outputs:

- signed health reports per backend per window
- optional conformance attestations

Specs:

- Health reports: `specs/health-report-format.md`
- Policy state machine: `specs/policy-state-machine.md`
