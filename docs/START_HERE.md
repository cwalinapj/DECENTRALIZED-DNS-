# START_HERE

If you only read one file, read this one.

## User Onboarding (Web2-first)

- No crypto required for users.
- Pricing is fixed in USD.
- You can pay in USD (recommended) or crypto; TollDNS handles settlement/volatility in treasury rails.
- User-facing checkout stays USD-first with stable pricing; crypto is optional and abstracted behind treasury settlement.

Read first:
- `docs/WEB2_PRICING_MODEL.md`
- `docs/PAYMENTS_AND_TREASURY.md`
- `docs/DOMAIN_CONTINUITY.md`

## Quickstart (user-facing)

1. Point your domain nameservers to TollDNS.
2. Enable continuity/notification policy so renewal problems are visible early.
3. Use TollDNS gateway/hosting defaults for reliability and faster rollout.
4. Use USD billing (or crypto rails with USD quote lock) without needing token ops.

## Pricing that won't surprise you

- renewals should not fail silently
- if payment fails, continuity warning/banner flow activates first
- eligible domains can remain reachable in safe degraded mode while renewal is pending
- policy remains bound by registrar/registry windows

## Developer quick verify

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
```

## Operator/Developer Proof (advanced)

```bash
npm run mvp:demo:devnet
```

This is internal proof for operators/developers (strict on-chain path), not end-user onboarding.

Latest proof snapshot:
- `docs/PROOF.md`
- `VERIFIED.md`
- `docs/DEVNET_STATUS.md`

## Miner onboarding
- Quickstart: `docs/MINER_QUICKSTART_CF.md`
- Onboarding UI: `docs/miner-onboard/index.html`
