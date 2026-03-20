# START_HERE

If you only read one file, read this one.

TollDNS should be read as:

- a portable naming and routing control plane first
- a resolver/gateway MVP today
- a broader decentralization roadmap later

Do not start from the operator or protocol paths unless you specifically need them.

Canonical path:

```bash
npm run mvp:validate:local
npm run mvp:demo:local
```

Strict operator proof:

```bash
npm run mvp:demo:devnet
```

Full command policy: [`docs/CANONICAL_DEMO_PATH.md`](./CANONICAL_DEMO_PATH.md)

## Jive Coders: 5-minute setup

New here? Run one command, browse a site, done:

```bash
npm run mvp:demo:local
```

Open Firefox → browse `https://netflix.com`. Full guide: [`docs/JIVE_CODER_5_MIN.md`](./JIVE_CODER_5_MIN.md)

Quick onboarding funnel:
- `docs/GET_STARTED.md`

## User Onboarding (Web2-first)

- No crypto required for users.
- Pricing is fixed in USD.
- You can pay in USD (recommended) or crypto; TollDNS handles settlement/volatility in treasury rails.
- User-facing checkout stays USD-first with stable pricing; crypto is optional and abstracted behind treasury settlement.

Read first:
- `docs/WEB2_PRICING_MODEL.md`
- `docs/PAYMENTS_AND_TREASURY.md`
- `docs/DOMAIN_CONTINUITY.md`
- `docs/NS_FRONT_DOOR.md`

The core promise at this stage is:

- keep control over naming and routing
- reduce platform dependency
- keep the local demo and onboarding path simple

## Quickstart (user-facing)

1. Start the gateway locally:
```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
```
2. Request a USD-first quote lock:
```bash
curl 'http://127.0.0.1:8054/v1/pay/quote?sku=renewal-basic&currency=USD'
```
3. Check renewal safety banner state and grace window:
```bash
curl 'http://127.0.0.1:8054/v1/domain/banner?domain=low-traffic.com&format=json'
```
4. Point your domain nameservers to TollDNS to unlock continuity/subsidy eligibility.
5. Keep user billing in USD; optional crypto rails stay behind treasury settlement.

## Pricing that won't surprise you

- renewals should not fail silently
- if payment fails, continuity warning/banner flow activates first
- eligible domains can remain reachable in safe degraded mode while renewal is pending
- policy remains bound by registrar/registry windows

## Developer quick verify

```bash
npm run mvp:validate:local
```

## Operator/Developer Proof (advanced)

```bash
npm run mvp:demo:devnet
```

This is internal proof for operators/developers. It is not the default way to understand or evaluate the product.

Latest proof snapshot:
- `docs/PROOF.md`
- `VERIFIED.md`
- `docs/DEVNET_STATUS.md`

## Miner onboarding
- Quickstart: `docs/MINER_QUICKSTART_CF.md`
- Onboarding UI: `docs/miner-onboard/index.html`

## Firefox TRR local test
- `docs/FIREFOX_TRR.md`
