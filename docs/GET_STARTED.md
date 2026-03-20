# GET_STARTED

Web2-first onboarding for the current MVP.

Read TollDNS as:

- TollDNS is a portable naming and routing layer for web properties
- the shipped path today is the resolver/gateway demo
- broader miner/operator infrastructure is advanced and optional

## Recommended First Run

Do this first. It is the shortest path to understanding the product.

### Browser Demo (Firefox TRR)

This is the clearest wedge:

- your browser uses the local TollDNS resolver path directly
- you see normal web browsing work through the stack
- you do not need to start with miners, devnet, or protocol details

1. Start gateway:
```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
```
2. Start local HTTPS TRR proxy:
```bash
TLS_PROXY_TARGET=http://127.0.0.1:8054 TLS_PROXY_PORT=8443 bash scripts/firefox_trr_tls_proxy.sh
```
3. Configure Firefox TRR:
   - `network.trr.mode=3`
   - `network.trr.uri=https://127.0.0.1:8443/dns-query`
   - `network.trr.custom_uri=https://127.0.0.1:8443/dns-query`
   - `network.trr.allow-rfc1918=true`
   - `network.trr.bootstrapAddr=127.0.0.1`
4. Verify + browse:
```bash
bash scripts/firefox_doh_verify.sh --url https://127.0.0.1:8443 --name netflix.com --type A --insecure
```
Then open `https://netflix.com` in Firefox.

Detailed guide: `docs/FIREFOX_TRR.md`.

## If You Want More Than the Demo

### Local Runtime + API Checks

Use this if you want to inspect the gateway behavior directly after the browser demo.

```bash
npm -C gateway ci
npm -C gateway test
npm -C gateway run build
PORT=8054 npm -C gateway run start
```

In another terminal:
```bash
TLS_PROXY_TARGET=http://127.0.0.1:8054 TLS_PROXY_PORT=8443 bash scripts/firefox_trr_tls_proxy.sh
```

Then:
```bash
curl 'http://127.0.0.1:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://127.0.0.1:8054/v1/resolve?name=example.dns&type=A'
bash scripts/gateway_smoke.sh
bash scripts/firefox_doh_verify.sh --url https://127.0.0.1:8443 --name netflix.com --type A --insecure
```

### What Happens When Upstreams Disagree?

- `confidence` reports how strong upstream agreement is (`high`, `medium`, `low`).
- TTL is clamped conservatively when confidence is lower.
- If upstreams fail after a good answer was cached, stale answers can be served briefly (`stale-if-error`) instead of hard-failing every lookup.
- Use `GET /v1/status` for live upstream/cache health and `GET /v1/attack-mode` for degradation policy state.

## Advanced Tracks

These are not required to understand the current product wedge.

### Become a Miner

```bash
npm run miner:cf:deploy
bash scripts/miner_cf_verify.sh --url https://<your-worker>.workers.dev --name netflix.com --type A
```

Wrangler account/login is manual once (email/CAPTCHA). After that, deploy is automated.

Miner docs:
- `docs/MINER_QUICKSTART_CF.md`
- `docs/miner-onboard/index.html`

### Operator / Treasury

Not required for the default product path:
- strict devnet proof: `npm run mvp:demo:devnet`
- reserve/deploy inventory: `docs/RENT_BOND.md`, `docs/DEVNET_STATUS.md`, `VERIFIED.md`
