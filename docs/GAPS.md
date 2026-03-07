# Gaps

## Remaining MVP truth gaps
- Compat validation script had stale paths and deleted plugin API references; keep `make e2e` aligned with current `labs/` assets and `plugins/wp-optin`.
- Program ID sync should gate canonical sources of truth (`Anchor.toml` + `declare_id!`) instead of local build keypairs in `solana/target/deploy`.

## Name registry backend
- `/resolve` currently uses DoH only.
- Internal `.dns` registry backend should be added for private names.
