# Bootstrap with Cloudflare Workers (until DDNS is live)

## Why Workers first
We need a stable, public HTTPS endpoint for:
- WordPress opt-in submissions
- admin APIs for registering sites and (later) workers
- global reliability (Anycast), DDoS protection, easy TLS

If we tried to host this directly on DDNS before it is stable, we'd create a bootstrapping dependency:
- clients must resolve + reach the endpoint to help us scale the network
- but the network isn't stable enough yet to be relied on for that endpoint

Workers break that loop.

## What runs on Workers
A small edge service (D1-backed) provides:
- `POST /v1/optin/submit` (public ingest)
- `POST /v1/admin/sites` (admin-only)
- `GET /v1/admin/sites/:site_id` (admin-only)

D1 stores:
- registered sites + origin allowlists
- opt-in submissions (append-only)

## Cutover path to DDNS
When DDNS is ready:
1. Keep the same public URL (`optin.<domain>`) but switch implementation:
   - Worker forwards requests to DDNS origin (edge-node) via an adaptor, OR
   - DNS is updated so `optin.<domain>` resolves to DDNS-controlled nodes
2. Maintain the same API contract:
   - `/v1/optin/submit` continues to accept the same payload schema
3. Optionally keep Worker permanently as a shield:
   - Worker validates + rate limits, then forwards to DDNS

## Security assumptions
Because WordPress submits directly from browsers (no WP public endpoints):
- Submissions are not client-signed with secrets.
- The edge enforces:
  - exact Origin allowlist per site_id (CORS)
  - nonce replay detection
  - rate limiting
  - schema validation
- Optional: Turnstile CAPTCHA can be added later for high-abuse environments.

## Operational notes
- Use `ADMIN_API_KEY` as a wrangler secret.
- Restrict admin endpoints further using Cloudflare Access when possible.
