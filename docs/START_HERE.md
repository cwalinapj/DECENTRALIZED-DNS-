# START_HERE

This is the canonical MVP entry page for this repo.

## What Is This Repo?

- A decentralized DNS/gateway stack with:
- recursive ICANN resolution (quorum + cache)
- `.dns` pathing via PKDNS/on-chain programs
- operator/miner services and policy guardrails

## What Is Live On Devnet

- Program IDs are source-of-truth in `solana/Anchor.toml` under `[programs.devnet]`.
- Verify deployments and authority ownership:

```bash
npm -C solana run devnet:verify
bash scripts/devnet_inventory.sh
```

- Default deploy authority wallet used in current runbooks:
- `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`

## Run Local Gateway

```bash
npm -C gateway ci
npm -C gateway run build
npm -C gateway run dev
```

In another terminal:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

## Miner Onboarding (Cloudflare Worker)

Use the existing onboarding flow:

- Quickstart: `docs/MINER_QUICKSTART_CF.md`
- Onboarding UI: `docs/miner-onboard/index.html`
- Root helper scripts:

```bash
npm run miner:cf:dev
npm run miner:cf:deploy
```

Note: Wrangler cannot create Cloudflare accounts or bypass CAPTCHA/email verification; login must be completed once in browser.

## Run Devnet Demo Script

```bash
npm run mvp:demo:devnet
```

Expected final marker:

```text
✅ demo complete
```

## Proofs + Verification Artifacts

- Command history and proof snippets: `VERIFIED.md`
- Solana-specific proof log: `solana/VERIFIED.md`
- Devnet runbook: `DEVNET_RUNBOOK.md`
- Current devnet status snapshot: `docs/DEVNET_STATUS.md`
- Program funding/reserve reporter: `scripts/devnet_inventory.sh`

## Minimal MVP Check Sequence

```bash
npm ci
npm test
npm -C gateway test && npm -C gateway run build
cd solana && anchor build
npm -C solana run devnet:verify
bash scripts/devnet_inventory.sh
```
