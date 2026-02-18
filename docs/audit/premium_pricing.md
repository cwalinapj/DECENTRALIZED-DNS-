# Premium Pricing Audit

Date (UTC): 2026-02-18
Branch: `codex/pr-premium-pricing`

## Commands Run

```bash
cd /Users/root1/scripts/ddns-premium-pricing/solana
anchor build --program-name ddns_names
```

Result:
- `anchor build --program-name ddns_names`: PASS

```bash
cd /Users/root1/scripts/ddns-premium-pricing
npm -C solana i
npm -C solana run names -- --help
```

Result:
- `npm -C solana run names -- --help`: PASS
- Shows commands: `init-config`, `claim-sub`, `buy-premium`, `set-primary`, `resolve-primary`

```bash
cd /Users/root1/scripts/ddns-premium-pricing
npm -C solana run names -- resolve-primary --owner B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5
```

Result:
- PASS
- Output includes derived primary PDA:
  - `HPohhMscN6QnLieNxZnST1zSj1dAmWcKZFbcveF3Akrg`

```bash
cd /Users/root1/scripts/ddns-premium-pricing/solana
cargo check -p ddns_names
```

Result:
- `cargo check -p ddns_names`: PASS

```bash
cd /Users/root1/scripts/ddns-premium-pricing/solana
anchor test --program-name ddns_names --run tests/ddns_names.ts
```

Result:
- PASS
- `ddns_names`:
  - `applies premium log pricing + reserves 1-2 char names for treasury authority`
  - `enforces subdomain transfer policy (user.dns non-transferable; premium parent co-sign path)`

## Notes

- This PR only introduces premium pricing + reservation logic in `ddns_names`, test updates, script argument updates, and docs.
- No secrets/keypairs were added.
