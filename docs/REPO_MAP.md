# Repo Map

Top-level folders and purpose:

- `adapters/` – adapter specs and stubs for external naming/storage networks; includes adapter conformance descriptors.
- `archive/` – non-MVP legacy material retained for reference (nothing deleted).
- `core/` – shared core libraries (schemas, error codes, DNS helpers).
- `coordinator/` – credits ledger + comment holds/finalize (MVP).
- `docs/` – documentation and specs.
- `gateway/` – name gateway MVP (`/resolve`, caching, adapters).
- `labs/` – non-MVP experiments, scaffolds, and legacy services moved out of the MVP surface.
- `plugins/` – MVP plugin pointer(s). Canonical WordPress plugins live in `web3-wp-plugins`.
- `registry/` – registry snapshot + Merkle tooling for `.dns`.
- `scripts/` – dev + validation scripts.
- `specs/` – protocol specs and formats.
- `tests/` – repo-level smoke + conformance tests.

Other notable top-level items:

- `docker-compose.dev.yml` – local dev compose for the MVP.
- `Makefile` – convenience targets.

Notes:
- Everything moved to `labs/` and `archive/` is retained; nothing was deleted.
