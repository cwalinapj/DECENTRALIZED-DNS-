# Canonical Demo Path

This is the single supported path for local onboarding, CI validation, and the strict devnet proof.

## Commands

1. Validate the repo locally:

```bash
npm run mvp:validate:local
```

This is the CI-equivalent local gate. It runs:

- `make fmt`
- `make lint`
- `make test`
- `make e2e`

2. Run the local browser demo:

```bash
npm run mvp:demo:local
```

This starts the local gateway plus TLS proxy, verifies DoH, and prints Firefox TRR settings.

3. Run the strict Solana devnet proof:

```bash
npm run mvp:demo:devnet
```

This is the operator-only proof path. It is not required for local browsing or compat validation.

## What To Use When

- New contributor or CI change: `npm run mvp:validate:local`
- Product demo on one machine: `npm run mvp:demo:local`
- Solana/operator proof: `npm run mvp:demo:devnet`

## Notes

- `npm run local:stack` remains available as an alias for `npm run mvp:demo:local`.
- Docs should point here instead of introducing alternate command sequences for the same local flow.
