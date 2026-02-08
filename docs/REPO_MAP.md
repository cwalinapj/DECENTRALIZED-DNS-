# Repo Map

Top-level folders and purpose:

- `_deprecated/` – retired or superseded assets; preserved for reference. Includes the previous typo folder `ervices/` (see note below).
- `adaptors/` – adapter specs and stubs for external naming/storage networks; includes adapter conformance descriptors.
- `client/` – wallet + client app scaffolds (stubs).
- `compat-control-plane/` – compat control plane MVP for provider integration (stubs).
- `contracts/` – EVM contracts scaffolds for registry/settlement/escrow.
- `ddns-core/` – shared core libraries (schemas, error codes, DNS helpers).
- `docker/` – docker assets for services and local dev.
- `docs/` – documentation and specs.
- `escrow/` – Index Unit escrow and voucher verifier prototypes.
- `infra/` – infra scaffolding (k8s, storage notes, orchestration).
- `miner/` – miner agents and diagnostics (stubs).
- `packages/` – shared package scaffolds.
- `plugins/` – integration plugins; WordPress plugins migrated to `web3-wp-plugins` (see `docs/MOVED_PLUGINS.md`).
- `policy/` – policy specs (stubs).
- `registry/` – registry snapshot + EVM scaffolds; `.dns` records live under `registry/snapshots/`.
- `resolver/` – name gateway MVP (/resolve, DoH).
- `scripts/` – dev + validation scripts.
- `security/` – security tooling and release integrity checks.
- `services/` – control-plane services and vault (stubs). Includes `services/control-plane/credits-coordinator` for credits + receipts.
- `services/builder-api/` – create/update/publish 5-page sites (MVP).
- `services/pages-hosting/` – Cloudflare Pages routing Worker (MVP).
- `settlement/` – settlement processor scaffolds (stubs).
- `solana/` – Solana program scaffolds (not devnet-ready).
- `specs/` – protocol specs and formats.
- `tests/` – repo-level smoke + conformance tests.
- `watchdogs/` – watchdog agents (stubs).
- `workers/` – background workers (stubs). Includes `workers/node-agent` for receipts + cache.
- `workers/site-builder/` – builds static HTML for Pages (MVP).

Other notable top-level items:

- `Hosting Platforms/` – hosting platform architecture and scaffolding.
- `docker-compose*.yml` – local dev and validation compose files.
- `Makefile` – convenience targets.

Notes:
- The previous typo folder `ervices/` has been moved to `_deprecated/ervices-typo` to avoid confusion.
