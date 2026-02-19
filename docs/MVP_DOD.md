# MVP Definition Of Done

0) Devnet deploy + funding audit (programs + wallet + vaults)

```bash
npm -C solana run devnet:verify
npm -C solana run devnet:audit
```

- `devnet:verify` must pass and confirm required devnet programs are deployed.
- `devnet:audit` must generate `docs/DEVNET_STATUS.md` with deploy wallet funding + program account status.

1) Build + test baseline

```bash
npm ci
npm test
npm -C gateway test
npm -C gateway run build
npm -C services/miner-witness test
npm -C services/miner-witness run build
cd solana && cargo generate-lockfile && anchor build
```

2) Runbook proof

- Use `solana/VERIFIED.md` for exact commands, tx signatures, and account proofs.
- Use `docs/DEVNET_STATUS.md` for current program deployment + funding reserve status.
