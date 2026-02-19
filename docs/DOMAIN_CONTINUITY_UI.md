# Domain Continuity UI (MVP)

This UI is a web2-friendly status dashboard for domain continuity policy checks.

File:

- `gateway/public/domain-continuity/index.html`

## Open Locally

Use any static file server from repo root:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/gateway/public/domain-continuity/index.html`

## What You Can Do

1. Enter a domain (for example `example.com`).
2. Set API base URL (default: `http://localhost:8054`).
3. Click **Check status**.
4. Review cards:
- eligibility + reason codes
- continuity phase (A/B/C/D)
- renewal due + grace end dates
- credits balance + estimate
- next steps
5. Use copy buttons for:
- `curl /v1/domain/status?...`
- TXT challenge helper value (when available)
6. Use signed notice flow:
- click **Fetch notice token**
- click **Verify notice token**
- confirm returned `valid: true` and decoded payload
7. Use continuity API actions:
- click **Start verification (TXT)** to generate/store a TXT challenge
- click **Claim continuity** to create a claim request (policy-stubbed)
- click **Call /v1/domain/renew** for renewal intent response (stubbed pending registrar integration)

## Expected MVP Behavior

- Status endpoint shape follows `docs/openapi.yaml`.
- UI is static and does not require a frontend build pipeline.
- Renewal button is a placeholder in MVP.

## Important MVP Note

This is MVP: registry integration is not active; statuses are computed by policy + local observations.
