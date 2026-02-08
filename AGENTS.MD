# AGENTS.md — TollDNS coding rules

## Goal
Implement an MVP in small, reviewable PRs that compiles, runs, and is validated by tests.

## Global rules
- Never commit secrets (.env, API keys, private keys).
- Prefer domain/DNS-first logic (our hosted properties are 100% proxied behind edge/CDN).
- Add tests for every new module.
- Run formatting + lint + tests before finishing a task.
- Keep PRs small: one feature/vertical slice per PR.

## Commands to validate
- make fmt
- make lint
- make test
- make e2e

## Security
- No raw email body storage in logs.
- No raw credential storage; use encrypted secrets store.
- No raw query logs by default; only bucketed metrics.

## Review checklist
- Does it run locally via docker compose?
- Does it include tests?
- Does it match specs in /specs and docs in /docs?
