# STATUS

Canonical status document: `docs/STATUS.md`.

## Devnet canonical IDs

Canonical program IDs are tracked in:
- `docs/DEVNET_STATUS.md`
- `solana/Anchor.toml` `[programs.devnet]`

Demo-critical IDs:
- `ddns_anchor`: `EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5`
- `ddns_registry`: `5F8ERKfRyErAJginsuRD4bN1oVZYFpJS5RVCFi9shRS3`
- `ddns_quorum`: `2PVfW3pT5q8gLSXi4VzAiB3JqJzowgvZW9akyXXANAE6`
- `ddns_stake`: `FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86`

## Strict demo front door

```bash
npm run mvp:demo:devnet
```

This command is strict and exits non-zero on failure.
