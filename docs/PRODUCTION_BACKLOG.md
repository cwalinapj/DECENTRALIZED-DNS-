# Production Backlog

This backlog turns the current MVP into a production launch plan with concrete gates.

## Current status

- Phase 1 (baseline guardrails): in progress
- Phase 2 (security + correctness hardening): pending
- Phase 3 (reliability + operations): pending
- Phase 4 (launch controls): pending

## Phase 1: baseline guardrails (implemented now)

- [x] Add explicit environment matrix templates
  - `config/environments/devnet.env.example`
  - `config/environments/staging.env.example`
  - `config/environments/mainnet.env.example`
- [x] Add production baseline validator
  - `scripts/prod_baseline_check.sh`
- [x] Add CI gate for baseline validator
  - `.github/workflows/prod-baseline.yml`
- [x] Add npm entrypoint for baseline validator
  - `npm run prod:baseline:check`

Acceptance criteria:

- CI fails when environment example files are missing or drift in key shape.
- CI fails when known legacy runtime program IDs are reintroduced.
- CI fails if strict on-chain demo markers are removed from funding flow.

## Phase 1: remaining tasks

- [x] Add sealed release manifests for each environment (`artifacts/releases/<env>.json`)
- [x] Add artifact checksum + signature verification gate in CI
- [ ] Add signed changelog verification in CI
- [ ] Add branch/tag release policy doc with rollback checklist

## Phase 2: security + correctness hardening

- [ ] External audit for Anchor programs and tollbooth/gateway critical paths
- [ ] Threat model document with abuse scenarios and mitigations
- [ ] On-chain invariant suite for route ownership and passport constraints
- [ ] Differential/chaos tests for gateway resolver behavior under upstream failures
- [ ] Incident severity matrix and security response playbook

Exit criteria:

- No open critical findings from external audit.
- Threat model reviewed and mapped to test coverage.
- Security runbook tested in tabletop incident exercise.

## Phase 3: reliability + operations

- [ ] SLOs and error budgets (gateway availability, route-write success, p95 latency)
- [ ] Structured telemetry baseline (logs, metrics, traces)
- [ ] Alerting runbooks and pager ownership
- [ ] HA deployment plan for tollbooth and gateway
- [ ] Backup + restore procedure for all off-chain state
- [ ] Capacity and load test thresholds with pass/fail gates

Exit criteria:

- Alerts fire correctly in staging drill.
- Backup restore validated in non-prod.
- Load test demonstrates headroom at target QPS.

## Phase 4: launch controls

- [ ] Progressive rollout policy (allowlist -> beta -> public)
- [ ] Governance controls (multisig/timelock, emergency pause policy)
- [ ] Mainnet readiness checklist with explicit go/no-go owners
- [ ] Post-launch monitoring and rollback window

Exit criteria:

- Signed go/no-go approval from engineering + operations.
- On-call rotations and escalation ownership active before launch.
