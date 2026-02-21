# Why Devs Use This Instead Of Raw DNS

- consistent JSON response
- cache confidence and upstream audit
- adapter proofs (.dns / IPFS / ENS / SNS)
- privacy-safe observations that strengthen network reliability
- dev monetization hooks (toll share / discounts / credits), policy controlled

MVP note: monetization and incentive distribution are policy-scoped and may be partially implemented per service/program path.

## Copy/Paste Examples

Node:

```bash
npx tsx packages/sdk/examples/node.ts
```

Worker:

```bash
npx tsx packages/sdk/worker/example.ts
```

Both examples read and print:
- `confidence`
- `upstreams_used`
- `rrset_hash`
