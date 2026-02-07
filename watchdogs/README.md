watchdogs/README.md
# Watchdogs (Health, Conformance, Incident Detection)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

The watchdog system continuously measures backend health and correctness and drives the immutable policy state machine that enables **automatic fallback**.

Watchdogs produce:
- Health Reports (`specs/health-report-format.md`)
- Conformance attestations (bounded equivalence surface)
- Optional incident-level signals (Attack Mode triggers)

Related:
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Policy state machine: `specs/policy-state-machine.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`

---

## Submodules

- `verifier-node/` — a watchdog verifier implementation (signs reports)
- `regional-probers/` — probes from multiple regions/ASNs
- `oracle-attesters/` — optional attesters for Index Unit pricing inputs and other signals
- `incident-detector/` — aggregates multi-backend degradation signals to recommend Attack Mode

The chain remains the source of truth for policy state; watchdogs supply signed inputs.
