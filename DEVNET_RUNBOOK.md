# DEVNET_RUNBOOK

This runbook is the minimal copy/paste path for running the current MVP on devnet.

## Environment

- RPC: `https://api.devnet.solana.com`
- Authority wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`

## 1) Verify Solana config + balance

```bash
solana config set -u https://api.devnet.solana.com
solana address
solana balance
```

Expected:
- `solana address` is your intended signer.
- Balance is sufficient for transaction fees and any deployment/tests.

## 2) Verify deployed programs used by MVP flows

```bash
solana program show -u devnet 5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx
solana program show -u devnet 9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB
solana program show -u devnet 6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF
```

Expected:
- Program account exists.
- `ProgramData Address` and `Authority` fields resolve without error.

## 3) Build local workspace used by scripts

```bash
cd solana
npm install
anchor build
```

Expected:
- `Finished` output from anchor/cargo build.

## 4) Run gateway locally and resolve ICANN + .dns

```bash
cd gateway
npm install
npm run build
npm run dev
```

In a second shell:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

Expected:
- ICANN response includes recursive/adaptive source fields (`confidence`, `upstreams_used`, `cache`).
- `.dns` requests go through PKDNS/adapted `.dns` path (not ICANN recursive consensus writes).

## 5) Verify canonical PDA/account proof pattern

Use the PDA and transaction references from `solana/VERIFIED.md`:

```bash
solana account -u devnet <PDA> --output json
```

Expected:
- Account data exists and decodes according to the documented program/account type.

## Notes

- If devnet rate limits occur, retry after a short delay or switch to another healthy devnet RPC endpoint.
- This runbook is for verification; it does not imply all experimental branches/programs are production-ready.
