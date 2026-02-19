# Domain Banner/Interstitial Integration (MVP)

This document explains how an operator can use TollDNS continuity banner pages during renewal delinquency windows.

## Endpoint

- `GET /v1/domain/banner?domain=<icann-domain>`
- Optional: `mode=banner|interstitial`

Behavior:

- Computes continuity status from local policy + stored domain state.
- Issues a signed notice token for that request.
- Renders HTML and injects:
  - domain
  - phase
  - renew CTA URL
  - notice token
  - verify endpoint URL (`/v1/domain/notice/verify`)

## Quick Test

```bash
curl -i 'http://127.0.0.1:8054/v1/domain/banner?domain=example.com'
curl -i 'http://127.0.0.1:8054/v1/domain/banner?domain=example.com&mode=interstitial'
```

## Proxy Pattern (example)

When a domain enters a renewal delinquency policy state, configure your edge/web server to proxy a path (or full host) to this endpoint.

Example flow:

1. Keep normal origin serving for non-delinquent domains.
2. During delinquency, route users to `/v1/domain/banner?domain=<domain>`.
3. Show the rendered notice page with **Renew now** CTA and token verification details.

## Operational Guidance

- Use banner mode for early warning phases (`A_SOFT_WARNING`, `B_HARD_WARNING`).
- Use interstitial mode for protected continuity phases (`C_SAFE_PARKED`, `D_REGISTRY_FINALIZATION`).
- Tokens are verifiable and do not include client identifiers.
- This is MVP-safe: registrar execution is still stubbed.
