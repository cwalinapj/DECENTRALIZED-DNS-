# Contributing to TollDNS / DECENTRALIZED-DNS

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

Thanks for contributing. This project is intentionally modular so you can land useful work quickly.

## Ground Rules

- **Small PRs**: one feature per PR.
- **Add tests**: unit tests required for new modules and non-trivial logic.
- **No secrets**: never commit API keys, private keys, seed phrases, or `.env` secrets.
- **Domain/DNS-first**: hosted properties are intended to be **proxy-only behind the edge/CDN**.
- **Privacy by default**: no raw query logs by default; prefer bucketed metrics.

## Quickstart

Start a local dev stack:

- See: `docs/QUICKSTART.md`

## Development Workflow

1) Fork and clone
2) Create a branch:
   - `git checkout -b feat/<short-name>`
3) Make changes with tests
4) Run checks locally (as available):
   - `make docs` (markdownlint)
   - `make test` (language-specific tests when implemented)
5) Open a PR and describe:
   - what changed
   - how to run/verify
   - what tests were added

## Issue Labels

We try to keep issues “claimable”:

- `good first issue` — small tasks, minimal context needed
- `help wanted` — medium tasks
- `P0/P1/P2` — priority level

## What to Work On

Start with: `docs/WORK_BREAKDOWN.md`

High-impact early modules:

- Gateway (DoH) + caching
- Upstream quorum adapter
- Policy engine (config-first)
- Gateway routing + IPFS adapter
- Receipts (proof-of-serving) hashing/signatures

## Adapter Contributions

If you implement a new adapter:

- follow `specs/backend-interface.md`
- add an example doc under `specs/examples/`
- add at least:
  - `describe()` coverage test
  - one `resolve()` test for the namespace
  - one `conformance_probe()` test (or stub if not yet wired)

## Code Style

Until language toolchains are finalized:

- keep code readable and well-commented
- prefer explicit errors over silent fallbacks
- add strict bounds on inputs (sizes, recursion depth, timeouts)

## Community / Maintainer Notes

If you want to become a long-term maintainer of a module:

- open an issue titled: “Owner: <Module Name>”
- list what you plan to deliver in the first two PRs

---


## MVP Workflow
- Run `scripts/dev.sh` for local resolver
- Use `docs/LOCAL_DEV.md` for details
